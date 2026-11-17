import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { helpRequests, participants } from "../db/schema";
import { assertCanWrite, canSeeLecture, canSeeLectureContent, isInstructor, loadCourse, loadLecture } from "../lib/access";
import { emitHelp } from "../lib/broadcast";
import type { Actor, AppEnv, Db } from "../lib/context";
import { fail, forbidden, notFound } from "../lib/errors";
import { assertUnderLimit, underKeyLimit } from "../lib/ratelimit";
import { sign, ulid } from "../lib/token";
import { ownedReadyFiles } from "./participant";
import { invalid } from "./validate";

export const TURN_TTL_SECONDS = 7200;

type HelpRow = typeof helpRequests.$inferSelect;

export function helpDto(row: HelpRow, p: { publicId: string; nickname: string; groupId: string | null } | undefined) {
  return {
    id: row.id,
    courseId: row.courseId,
    lectureId: row.lectureId,
    kind: row.kind,
    message: row.message,
    fileId: row.fileId,
    status: row.status,
    createdAt: row.createdAt,
    handledAt: row.handledAt,
    participant: { publicId: p?.publicId ?? "", nickname: p?.nickname ?? "알 수 없음", groupId: p?.groupId ?? null },
  };
}

export type HelpDto = ReturnType<typeof helpDto>;

export const participantOf = (actor: Actor) => {
  if (actor.type !== "participant") return forbidden("과정에 먼저 입장해 주세요.");
  return actor.p;
};

/** 처리한 요청은 최근 것만 보낸다. 몇 주짜리 과정이면 수백 개가 쌓인다. */
export const DONE_LIMIT = 30;

export async function helpRows(db: Db, courseId: string) {
  const [active, done] = await Promise.all([
    db.select().from(helpRequests).where(and(eq(helpRequests.courseId, courseId), ne(helpRequests.status, "done"))).orderBy(helpRequests.createdAt).all(),
    db.select().from(helpRequests).where(and(eq(helpRequests.courseId, courseId), eq(helpRequests.status, "done"))).orderBy(desc(helpRequests.createdAt)).limit(DONE_LIMIT).all(),
  ]);
  const rows = [...active, ...done.reverse()];
  const ids = [...new Set(rows.map((r) => r.participantId))];
  const people = new Map<string, { publicId: string; nickname: string; groupId: string | null }>();
  for (let i = 0; i < ids.length; i += 90) {
    const found = await db
      .select({ id: participants.id, publicId: participants.publicId, nickname: participants.nickname, groupId: participants.groupId })
      .from(participants)
      .where(inArray(participants.id, ids.slice(i, i + 90)))
      .all();
    for (const p of found) people.set(p.id, p);
  }
  return rows.map((r) => helpDto(r, people.get(r.participantId)));
}

export const helpRoutes = new Hono<AppEnv>()
  .post(
    "/help/screenshot",
    zValidator("json", z.object({ lectureId: z.string(), fileId: z.string(), message: z.string().trim().max(200, "메시지는 200자까지 쓸 수 있어요.").nullish() }), invalid),
    async (c) => {
      const db = c.get("db");
      const actor = c.get("actor");
      const p = participantOf(actor);
      const input = c.req.valid("json");
      const { lecture, course } = await loadLecture(db, input.lectureId);
      assertCanWrite(actor, course, lecture);
      await assertUnderLimit(db, actor, "screenshot");
      const owned = await ownedReadyFiles(db, actor, [input.fileId]);
      if (owned.get(input.fileId)!.category !== "screenshot") fail(400, "bad_file", "스크린샷을 다시 올려 주세요.");
      const row: HelpRow = {
        id: ulid(),
        courseId: course.id,
        lectureId: lecture.id,
        participantId: p.id,
        kind: "screenshot",
        message: input.message || null,
        fileId: input.fileId,
        status: "waiting",
        createdAt: Date.now(),
        handledAt: null,
      };
      await db.insert(helpRequests).values(row).run();
      const dto = helpDto(row, p);
      emitHelp(c, course.id, { type: "help.new", request: dto });
      return c.json({ request: dto });
    },
  )

  .post("/help/live", zValidator("json", z.object({ lectureId: z.string() }), invalid), async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const p = participantOf(actor);
    const { lecture, course } = await loadLecture(db, c.req.valid("json").lectureId);
    assertCanWrite(actor, course, lecture);
    const now = Date.now();
    const row: HelpRow = {
      id: ulid(now),
      courseId: course.id,
      lectureId: lecture.id,
      participantId: p.id,
      kind: "live",
      message: null,
      fileId: null,
      status: "waiting",
      createdAt: now,
      handledAt: null,
    };
    await db.batch([
      db
        .update(helpRequests)
        .set({ status: "done", handledAt: now })
        .where(and(eq(helpRequests.participantId, p.id), eq(helpRequests.kind, "live"), inArray(helpRequests.status, ["waiting", "viewing"]))),
      db.insert(helpRequests).values(row),
    ]);
    const dto = helpDto(row, p);
    emitHelp(c, course.id, { type: "help.new", request: dto });
    return c.json({ request: dto });
  })

  .delete("/help/live/:id", async (c) => {
    const db = c.get("db");
    const p = participantOf(c.get("actor"));
    const row = await db.select().from(helpRequests).where(eq(helpRequests.id, c.req.param("id"))).get();
    if (!row || row.participantId !== p.id) return notFound();
    await db.update(helpRequests).set({ status: "done", handledAt: Date.now() }).where(eq(helpRequests.id, row.id)).run();
    emitHelp(c, row.courseId, { type: "help.update", id: row.id, status: "done" });
    emitHelp(c, row.courseId, { type: "rtc.end", helpId: row.id, from: p.publicId });
    return c.json({ ok: true });
  })

  .post("/ws-ticket", zValidator("json", z.object({ kind: z.enum(["lecture", "help"]), id: z.string() }), invalid), async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    if (actor.type === "anon") return forbidden("과정에 먼저 입장해 주세요.");
    if (actor.type === "participant" && actor.p.courseId !== (c.req.valid("json").kind === "help" ? c.req.valid("json").id : actor.p.courseId)) return forbidden();
    const { kind, id } = c.req.valid("json");
    // 시작 전 강의의 수강생은 시작 알림만 받는다 (LectureRoom의 waiting). 강사가 시작하면 바로 열린다.
    let waiting = false;
    if (kind === "lecture") {
      const { lecture, course } = await loadLecture(db, id);
      if (actor.type === "participant" && lecture.courseId !== actor.p.courseId) return forbidden();
      if (!canSeeLecture(actor, course, lecture)) return forbidden("강의가 공개되면 연결돼요.");
      waiting = !canSeeLectureContent(actor, course, lecture);
    } else {
      await loadCourse(db, id);
    }
    const ticket = await sign(c.env.SESSION_SECRET, {
      exp: Date.now() + 60_000,
      kind,
      id,
      conn: isInstructor(actor)
        ? { role: "instructor", publicId: null, nickname: null, groupId: null, participantId: null }
        : {
            role: "participant",
            publicId: (actor as Extract<Actor, { type: "participant" }>).p.publicId,
            nickname: (actor as Extract<Actor, { type: "participant" }>).p.nickname,
            groupId: (actor as Extract<Actor, { type: "participant" }>).p.groupId,
            participantId: (actor as Extract<Actor, { type: "participant" }>).p.id,
            waiting,
          },
    });
    return c.json({ ticket });
  })

  .get("/turn-credentials", async (c) => {
    if (c.get("actor").type === "anon") return forbidden("과정에 먼저 입장해 주세요.");
    const stun = { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] as RTCIceServerLike[] };
    if (!c.env.TURN_KEY_ID || !c.env.TURN_KEY_API_TOKEN) return c.json(stun);
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${c.env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.env.TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
    });
    if (!res.ok) return c.json(stun);
    const data = (await res.json()) as { iceServers: RTCIceServerLike | RTCIceServerLike[] };
    return c.json({ iceServers: Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers] });
  })

  .post("/client-errors", zValidator("json", z.object({ message: z.string().max(1000), stack: z.string().max(4000).nullish(), url: z.string().max(500).nullish() }), invalid), async (c) => {
    const input = c.req.valid("json");
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    if (await underKeyLimit(c.env, "error", ip)) {
      console.error(JSON.stringify({ msg: "client error", ...input, url: input.url?.split("?")[0], userAgent: c.req.header("user-agent"), kst: new Date(Date.now() + 9 * 3_600_000).toISOString() }));
    }
    return c.json({ ok: true });
  });

type RTCIceServerLike = { urls: string | string[]; username?: string; credential?: string };
