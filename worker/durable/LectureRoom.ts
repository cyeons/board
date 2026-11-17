import { DurableObject } from "cloudflare:workers";
import type { Audience } from "../lib/access";
import type { RoomEvent } from "../lib/broadcast";

/** waiting: 시작 전 강의에 들어온 수강생. 강의 상태와 과정 변경만 받고, 강의가 열리면 풀린다. */
export type Conn = { role: "instructor" | "participant"; publicId: string | null; nickname: string | null; groupId: string | null; waiting?: boolean };

/** 강의 상태가 바뀌면 수강생 연결의 waiting을 맞춘다. 과정 종료 같은 다른 상태는 그대로 둔다. */
function waitingAfter(conn: Conn, event: RoomEvent): boolean {
  if (conn.role !== "participant" || event.type !== "lecture.status") return Boolean(conn.waiting);
  if (event.status === "before") return true;
  if (event.status === "open" || event.status === "closed") return false;
  return Boolean(conn.waiting);
}

export function reaches(audience: Audience, conn: Conn): boolean {
  switch (audience.kind) {
    case "all":
      return true;
    case "instructor":
      return conn.role === "instructor";
    case "participants":
      return conn.role === "participant";
    case "instructor_and":
      return conn.role === "instructor" || conn.publicId === audience.publicId;
    case "one":
      return conn.publicId === audience.publicId;
  }
}

/** 강의마다 하나. 방송만 한다. 원본은 D1이고 연결 정보는 Hibernation을 견디도록 연결에 붙여 둔다. */
export class LectureRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  override async fetch(req: Request): Promise<Response> {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(JSON.parse(decodeURIComponent(req.headers.get("x-board-conn")!)));
    this.sendPresence();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  broadcast(event: RoomEvent, audience: Audience) {
    const text = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      const before = ws.deserializeAttachment() as Conn;
      let conn: Conn = { ...before, waiting: waitingAfter(before, event) };
      if (event.type === "participant.update" && conn.publicId === event.publicId) conn = { ...conn, nickname: event.nickname, groupId: event.groupId };
      if (conn.waiting !== Boolean(before.waiting) || conn.nickname !== before.nickname || conn.groupId !== before.groupId) ws.serializeAttachment(conn);
      if (conn.waiting && event.type !== "lecture.status" && event.type !== "course.update") continue;
      if (reaches(audience, conn)) send(ws, text);
    }
    if (event.type === "participant.update") this.sendPresence();
  }

  presence(except?: WebSocket) {
    const seen = new Map<string, { publicId: string; nickname: string; groupId: string | null }>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const conn = ws.deserializeAttachment() as Conn;
      if (conn.role === "participant" && conn.publicId) {
        seen.set(conn.publicId, { publicId: conn.publicId, nickname: conn.nickname ?? "", groupId: conn.groupId });
      }
    }
    return { count: seen.size, participants: [...seen.values()] };
  }

  private sendPresence(except?: WebSocket) {
    const text = JSON.stringify({ type: "presence", ...this.presence(except) });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except && (ws.deserializeAttachment() as Conn).role === "instructor") send(ws, text);
    }
  }

  override webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      // 이미 닫힌 연결
    }
    this.sendPresence(ws);
  }

  override webSocketError(ws: WebSocket) {
    this.sendPresence(ws);
  }
}

function send(ws: WebSocket, text: string) {
  try {
    ws.send(text);
  } catch {
    // 닫히는 중인 연결은 재연결 때 쿼리 무효화로 맞춰진다
  }
}
