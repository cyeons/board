import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import * as schema from "../db/schema";
import { forbidden } from "./errors";
import { sha256Hex, verify } from "./token";

export const getDb = (env: Env) => drizzle(env.DB, { schema });
export type Db = ReturnType<typeof getDb>;

export type Participant = typeof schema.participants.$inferSelect;

export type Actor = { type: "instructor" } | { type: "participant"; p: Participant } | { type: "anon" };

export type AppEnv = {
  Bindings: Env;
  Variables: { actor: Actor; db: Db; courseId?: string };
};

export const ADMIN_COOKIE = "board_admin";
export const participantCookie = (courseId: string) => `board_p_${courseId}`;

export async function adminVersion(db: Db): Promise<number> {
  const row = await db.select({ v: schema.adminState.sessionVersion }).from(schema.adminState).where(eq(schema.adminState.id, 1)).get();
  return row?.v ?? 1;
}

/** 요청마다 누가 보냈는지 정한다. 쓰기 요청에 강사 쿠키가 쓰였으면 출처까지 확인한다. */
export const actorMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const db = getDb(c.env);
  c.set("db", db);

  const session = await verify<{ exp: number; v: number }>(c.env.SESSION_SECRET, getCookie(c, ADMIN_COOKIE));
  if (session && session.v === (await adminVersion(db))) {
    const safe = c.req.method === "GET" || c.req.method === "HEAD";
    if (!safe && !sameOrigin(c.req.raw)) forbidden("다른 사이트에서 보낸 요청은 받을 수 없어요.");
    c.set("actor", { type: "instructor" });
    return next();
  }

  const bearer = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) {
    const hash = await sha256Hex(bearer);
    const p = await db.select().from(schema.participants).where(eq(schema.participants.tokenHash, hash)).get();
    if (p && !p.revokedAt) {
      c.set("actor", { type: "participant", p });
      c.set("courseId", p.courseId);
      const now = Date.now();
      if (now - p.lastSeenAt > 3_600_000) {
        c.executionCtx.waitUntil(db.update(schema.participants).set({ lastSeenAt: now }).where(eq(schema.participants.id, p.id)).run());
      }
      return next();
    }
  }
  c.set("actor", { type: "anon" });
  return next();
});

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export const requireInstructor = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("actor").type !== "instructor") forbidden("강사로 로그인해 주세요.");
  await next();
});
