import { and, count, eq, gte } from "drizzle-orm";
import { comments, files, helpRequests, posts } from "../db/schema";
import type { Actor, Db } from "./context";
import { tooMany } from "./errors";

const WINDOW_MS = 60_000;

export const LIMITS = { post: 5, comment: 20, screenshot: 3, upload: 20 } as const;

/** 최근 1분 개수로 도배를 막는다 (plan.md 14.3). 강사에게는 적용하지 않는다. */
export async function assertUnderLimit(db: Db, actor: Actor, what: keyof typeof LIMITS) {
  if (actor.type !== "participant") return;
  const since = Date.now() - WINDOW_MS;
  const id = actor.p.id;
  const query =
    what === "post"
      ? db.select({ n: count() }).from(posts).where(and(eq(posts.participantId, id), gte(posts.createdAt, since)))
      : what === "comment"
        ? db.select({ n: count() }).from(comments).where(and(eq(comments.participantId, id), gte(comments.createdAt, since)))
        : what === "screenshot"
          ? db.select({ n: count() }).from(helpRequests).where(and(eq(helpRequests.participantId, id), eq(helpRequests.kind, "screenshot"), gte(helpRequests.createdAt, since)))
          : db.select({ n: count() }).from(files).where(and(eq(files.uploaderId, id), gte(files.createdAt, since)));
  const row = await query.get();
  if ((row?.n ?? 0) >= LIMITS[what]) tooMany();
}

/** 저장된 기록이 없는 입장, 링크 미리보기, 오류 보고는 키마다 Durable Object로 센다. */
export const KEY_LIMITS = { join: 120, preview: 20, error: 20 } as const;

export async function underKeyLimit(env: Env, kind: keyof typeof KEY_LIMITS, key: string) {
  return env.RATE_LIMITER.getByName(`${kind}:${key}`).hit(KEY_LIMITS[kind], WINDOW_MS);
}

export async function assertKeyLimit(env: Env, kind: keyof typeof KEY_LIMITS, key: string) {
  if (!(await underKeyLimit(env, kind, key))) tooMany();
}
