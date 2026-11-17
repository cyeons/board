import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { lectures } from "../db/schema";
import type { Audience } from "./access";
import type { AppEnv } from "./context";
import type { PostDto } from "./dto";

export type RoomEvent =
  | { type: "lecture.status"; lectureId: string; status: string }
  | { type: "notice.update"; lectureId: string }
  | { type: "card.upsert"; card: unknown; revealed?: boolean }
  | { type: "card.remove"; cardId: string }
  | { type: "card.move"; cardId: string; sortKey: string }
  | { type: "post.upsert"; post: PostDto; created?: boolean }
  | { type: "post.remove"; postId: string; cardId: string | null; tab: string }
  | { type: "post.move"; postId: string; cardId: string; sortKey: string }
  | { type: "comment.upsert"; comment: unknown; commentCount: number }
  | { type: "comment.remove"; commentId: string; postId: string; commentCount: number }
  | { type: "like.update"; postId: string; count: number; instructorLiked: boolean }
  | { type: "participant.update"; publicId: string; nickname: string; groupId: string | null }
  | { type: "course.update" }
  | { type: "notify"; kind: "instructor_comment" | "instructor_like"; postId: string; cardId: string | null };

const ALL: Audience = { kind: "all" };

/** D1에 저장한 뒤 강의 방에 알린다. 실패해도 원본은 D1에 있으므로 요청을 실패시키지 않는다. */
export function emit(c: Context<AppEnv>, lectureId: string, event: RoomEvent, audience: Audience = ALL) {
  // 게시물의 `liked`는 요청한 사람 기준이라 다른 사람에게 보내면 안 된다. 받는 쪽은 자기 값을 유지한다.
  if (event.type === "post.upsert") event = { ...event, post: { ...event.post, liked: false } };
  c.executionCtx.waitUntil(
    c.env.LECTURE_ROOM.getByName(lectureId)
      .broadcast(event, audience)
      .catch((e: unknown) => console.error(JSON.stringify({ msg: "broadcast failed", lectureId, type: event.type, error: String(e) }))),
  );
}

export function emitHelp(c: Context<AppEnv>, courseId: string, event: Record<string, unknown>, audience: Audience = { kind: "instructor" }) {
  c.executionCtx.waitUntil(
    c.env.HELP_DESK.getByName(courseId)
      .notify(event, audience)
      .catch((e: unknown) => console.error(JSON.stringify({ msg: "help notify failed", courseId, error: String(e) }))),
  );
}

/** 수강생이 머물 수 있는 강의 방(진행 중, 시작 전) 전부에 알린다. */
export async function emitCourse(c: Context<AppEnv>, courseId: string, event: RoomEvent) {
  const live = await c
    .get("db")
    .select({ id: lectures.id })
    .from(lectures)
    .where(and(eq(lectures.courseId, courseId), inArray(lectures.status, ["open", "before"]), isNull(lectures.deletedAt)))
    .all();
  for (const { id } of live) emit(c, id, event);
}

/** 닉네임, 모둠 변경 */
export const emitParticipant = (c: Context<AppEnv>, courseId: string, p: { publicId: string; nickname: string; groupId: string | null }) =>
  emitCourse(c, courseId, { type: "participant.update", ...p });
