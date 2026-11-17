import { DurableObject } from "cloudflare:workers";
import type { Audience } from "../lib/access";
import { type Conn, reaches } from "./LectureRoom";

type HelpConn = Conn & { participantId: string | null };

const RTC = new Set(["rtc.offer", "rtc.answer", "rtc.ice", "rtc.end"]);

/** 과정마다 하나. 도움 요청 알림과 화면 공유 신호를 전달한다. */
export class HelpDesk extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  override async fetch(req: Request): Promise<Response> {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(JSON.parse(decodeURIComponent(req.headers.get("x-board-conn")!)));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  notify(event: Record<string, unknown>, audience: Audience) {
    const text = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (reaches(audience, ws.deserializeAttachment() as HelpConn)) send(ws, text);
    }
  }

  /** `rtc.*` 신호는 당사자에게만 간다. 수강생은 강사에게만, 강사는 지정한 수강생에게만 보낼 수 있다. */
  override webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    let msg: { type?: string; to?: string; helpId?: string; data?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg.type || !RTC.has(msg.type)) return;
    const from = ws.deserializeAttachment() as HelpConn;
    const audience: Audience = from.role === "participant" ? { kind: "instructor" } : msg.to ? { kind: "one", publicId: msg.to } : { kind: "instructor" };
    if (from.role === "instructor" && !msg.to) return;
    this.notify({ type: msg.type, helpId: msg.helpId, from: from.publicId, data: msg.data }, audience);
  }

  /** 수강생 연결이 모두 끊기면 그 사람의 실시간 공유 요청을 끝낸다. 스크린샷 요청은 남긴다. */
  override async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      // 이미 닫힌 연결
    }
    const conn = ws.deserializeAttachment() as HelpConn;
    if (conn.role !== "participant" || !conn.participantId) return;
    const stillHere = this.ctx.getWebSockets().some((other) => other !== ws && (other.deserializeAttachment() as HelpConn).participantId === conn.participantId);
    if (stillHere) return;
    const ended = await this.env.DB.prepare(
      "UPDATE help_requests SET status = 'done', handled_at = ?1 WHERE participant_id = ?2 AND kind = 'live' AND status IN ('waiting', 'viewing') RETURNING id",
    )
      .bind(Date.now(), conn.participantId)
      .all<{ id: string }>();
    for (const row of ended.results) {
      this.notify({ type: "help.update", id: row.id, status: "done" }, { kind: "instructor" });
      this.notify({ type: "rtc.end", helpId: row.id, from: conn.publicId }, { kind: "instructor" });
    }
  }
}

function send(ws: WebSocket, text: string) {
  try {
    ws.send(text);
  } catch {
    // 닫히는 중인 연결
  }
}
