import { and, eq, isNull } from "drizzle-orm";
import { cards, courses, lectures, posts } from "../db/schema";
import type { Actor, Db } from "./context";
import { locked, notFound } from "./errors";

export type Course = typeof courses.$inferSelect;
export type Lecture = typeof lectures.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Post = typeof posts.$inferSelect;

export const isInstructor = (a: Actor) => a.type === "instructor";

/** 강의를 볼 수 있는지 (plan.md 10.3 보기 규칙). 시작 전 강의는 일정만 보여 주므로 따로 판단한다. */
export function canSeeLecture(actor: Actor, course: Course, lecture: Lecture): boolean {
  if (course.deletedAt || lecture.deletedAt) return false;
  return isInstructor(actor) || lecture.published === 1;
}

export function canSeeLectureContent(actor: Actor, course: Course, lecture: Lecture): boolean {
  return canSeeLecture(actor, course, lecture) && (isInstructor(actor) || lecture.status !== "before");
}

export function canSeeCard(actor: Actor, course: Course, lecture: Lecture, card: Card): boolean {
  if (card.deletedAt || !canSeeLectureContent(actor, course, lecture)) return false;
  return isInstructor(actor) || card.visible === 1;
}

export function canSeePost(actor: Actor, course: Course, lecture: Lecture, card: Card | null, post: Post): boolean {
  if (post.deletedAt) return false;
  if (!canSeeLectureContent(actor, course, lecture)) return false;
  if (isInstructor(actor)) return true;
  if (post.tab === "notice") return true;
  if (!card || !canSeeCard(actor, course, lecture, card)) return false;
  if (post.tab === "assignment" && card.assignmentVisibility === "instructor_only") {
    return actor.type === "participant" && actor.p.id === post.participantId;
  }
  return true;
}

/** 수강생이 이 강의에 쓸 수 있는지. 강사는 언제나 쓴다. */
export function assertCanWrite(actor: Actor, course: Course, lecture: Lecture) {
  if (isInstructor(actor)) return;
  if (actor.type !== "participant" || actor.p.courseId !== course.id) notFound("과정에 먼저 입장해 주세요.");
  if (course.status === "ended") locked("종료된 과정이에요. 보기와 내려받기만 할 수 있어요.");
  if (lecture.status !== "open") locked();
}

export async function loadCourse(db: Db, id: string): Promise<Course> {
  const course = await db.select().from(courses).where(and(eq(courses.id, id), isNull(courses.deletedAt))).get();
  return course ?? notFound();
}

export async function loadLecture(db: Db, id: string) {
  const lecture = await db.select().from(lectures).where(and(eq(lectures.id, id), isNull(lectures.deletedAt))).get();
  if (!lecture) return notFound();
  return { lecture, course: await loadCourse(db, lecture.courseId) };
}

export async function loadCard(db: Db, id: string) {
  const card = await db.select().from(cards).where(and(eq(cards.id, id), isNull(cards.deletedAt))).get();
  if (!card) return notFound();
  return { card, ...(await loadLecture(db, card.lectureId)) };
}

export async function loadPost(db: Db, id: string, opts: { includeDeleted?: boolean } = {}) {
  const post = await db.select().from(posts).where(eq(posts.id, id)).get();
  if (!post || (post.deletedAt && !opts.includeDeleted)) return notFound();
  const card = post.cardId ? ((await db.select().from(cards).where(eq(cards.id, post.cardId)).get()) ?? null) : null;
  return { post, card, ...(await loadLecture(db, post.lectureId)) };
}

/** 이 게시물의 이벤트를 누가 받아도 되는지 (plan.md 11.2). */
export type Audience = { kind: "all" } | { kind: "instructor" } | { kind: "participants" } | { kind: "instructor_and"; publicId: string } | { kind: "one"; publicId: string };

export function postAudience(card: Card | null, post: Post, authorPublicId: string | null): Audience {
  if (card && !card.visible) return { kind: "instructor" };
  if (post.tab === "assignment" && card?.assignmentVisibility === "instructor_only") {
    return authorPublicId ? { kind: "instructor_and", publicId: authorPublicId } : { kind: "instructor" };
  }
  return { kind: "all" };
}
