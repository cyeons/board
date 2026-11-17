import { and, count, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { attachments, comments, courses, files, likes, participants, posts } from "../db/schema";
import type { Card, Lecture, Post } from "./access";
import type { Actor, Db } from "./context";

/** D1은 쿼리당 바인드 값 100개까지다. */
export function chunks<T>(items: T[], size = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type AuthorRow = { publicId: string; nickname: string; avatarColor: number };

const authorDto = (type: "instructor" | "participant", row: AuthorRow | undefined, instructorName: string) =>
  type === "instructor"
    ? { type, publicId: null, name: instructorName, avatarColor: 0 }
    : { type, publicId: row?.publicId ?? null, name: row?.nickname ?? "알 수 없음", avatarColor: row?.avatarColor ?? 0 };

export type Author = ReturnType<typeof authorDto>;

async function authorsOf(db: Db, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, AuthorRow>();
  for (const part of chunks(unique)) {
    const rows = await db
      .select({ id: participants.id, publicId: participants.publicId, nickname: participants.nickname, avatarColor: participants.avatarColor })
      .from(participants)
      .where(inArray(participants.id, part))
      .all();
    for (const r of rows) map.set(r.id, r);
  }
  return map;
}

type CommentRow = typeof comments.$inferSelect;

const commentDto = (row: CommentRow, author: AuthorRow | undefined, instructorName: string) => ({
  id: row.id,
  postId: row.postId,
  author: authorDto(row.authorType, author, instructorName),
  body: row.body,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export type CommentDto = ReturnType<typeof commentDto>;

export async function hydrateComments(db: Db, rows: CommentRow[], instructorName: string): Promise<CommentDto[]> {
  const authors = await authorsOf(db, rows.map((r) => r.participantId));
  return rows.map((r) => commentDto(r, r.participantId ? authors.get(r.participantId) : undefined, instructorName));
}

/** 게시물 목록에 첨부, 최근 댓글 2개, 작성자, 내 좋아요를 붙인다. */
export async function hydratePosts(db: Db, rows: Post[], actor: Actor, instructorName: string) {
  const ids = rows.map((r) => r.id);
  const atts: (typeof attachments.$inferSelect & { file: { filename: string; size: number; mime: string; width: number | null; height: number | null; hasThumb: boolean } | null })[] = [];
  const recent = new Map<string, CommentRow[]>();
  const liked = new Set<string>();
  const likerKey = actor.type === "instructor" ? "instructor" : actor.type === "participant" ? actor.p.id : null;

  for (const part of chunks(ids)) {
    const found = await db
      .select({ a: attachments, f: { filename: files.filename, size: files.size, mime: files.mime, width: files.width, height: files.height, thumb: files.thumbR2Key } })
      .from(attachments)
      .leftJoin(files, eq(attachments.fileId, files.id))
      .where(inArray(attachments.postId, part))
      .orderBy(attachments.position)
      .all();
    for (const { a, f } of found) {
      atts.push({ ...a, file: f ? { filename: f.filename, size: f.size, mime: f.mime, width: f.width, height: f.height, hasThumb: Boolean(f.thumb) } : null });
    }
    const withComments = rows.filter((r) => part.includes(r.id) && r.commentCount > 0).map((r) => r.id);
    if (withComments.length) {
      const list = await db
        .select()
        .from(comments)
        .where(and(inArray(comments.postId, withComments), isNull(comments.deletedAt)))
        .orderBy(desc(comments.createdAt))
        .all();
      for (const c of list) {
        const held = recent.get(c.postId) ?? [];
        if (held.length < 2) {
          held.unshift(c);
          recent.set(c.postId, held);
        }
      }
    }
    if (likerKey) {
      const mine = await db
        .select({ postId: likes.postId })
        .from(likes)
        .where(and(eq(likes.likerKey, likerKey), inArray(likes.postId, part)))
        .all();
      for (const l of mine) liked.add(l.postId);
    }
  }

  const authors = await authorsOf(db, [...rows.map((r) => r.participantId), ...[...recent.values()].flat().map((c) => c.participantId)]);

  return rows.map((r) => ({
    id: r.id,
    cardId: r.cardId,
    lectureId: r.lectureId,
    tab: r.tab,
    author: authorDto(r.authorType, r.participantId ? authors.get(r.participantId) : undefined, instructorName),
    groupId: r.groupId,
    title: r.title,
    body: r.body,
    sortKey: r.sortKey,
    pinnedAt: r.pinnedAt,
    isLate: r.isLate === 1,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    instructorLiked: r.instructorLiked === 1,
    liked: liked.has(r.id),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    attachments: atts
      .filter((a) => a.postId === r.id)
      .map((a) => ({
        id: a.id,
        kind: a.kind,
        fileId: a.fileId,
        url: a.url,
        linkTitle: a.linkTitle,
        linkDescription: a.linkDescription,
        linkImage: a.linkImage,
        linkSite: a.linkSite,
        linkProvider: a.linkProvider,
        file: a.file,
      })),
    recentComments: (recent.get(r.id) ?? []).map((c) => commentDto(c, c.participantId ? authors.get(c.participantId) : undefined, instructorName)),
  }));
}

export type PostDto = Awaited<ReturnType<typeof hydratePosts>>[number];

export async function hydratePost(db: Db, row: Post, actor: Actor, instructorName: string): Promise<PostDto> {
  return (await hydratePosts(db, [row], actor, instructorName))[0]!;
}

export const cardDto = (c: Card, counts?: { material: number; assignment: number; lastPostAt: number | null }) => ({
  id: c.id,
  lectureId: c.lectureId,
  sortKey: c.sortKey,
  emoji: c.emoji,
  title: c.title,
  summary: c.summary,
  visible: c.visible === 1,
  hasAssignment: c.hasAssignment === 1,
  assignmentDueAt: c.assignmentDueAt,
  assignmentVisibility: c.assignmentVisibility,
  materialCount: counts?.material ?? 0,
  assignmentCount: counts?.assignment ?? 0,
  lastPostAt: counts?.lastPostAt ?? null,
  /** 요청한 수강생이 이 카드에 과제를 냈는지. 강의 조회에서만 채운다 */
  submitted: false as boolean,
});

export type CardDto = ReturnType<typeof cardDto>;

/** 강의의 카드별, 탭별 글 개수와 마지막 글 시각 */
export function cardCountRows(db: Db, lectureId: string) {
  return db
    .select({ cardId: posts.cardId, tab: posts.tab, n: count(), last: max(posts.createdAt) })
    .from(posts)
    .where(and(eq(posts.lectureId, lectureId), isNull(posts.deletedAt)))
    .groupBy(posts.cardId, posts.tab)
    .all();
}

/** 카드에 자료, 과제 개수와 마지막 글 시각을 붙인다. 강사만 보기 카드의 과제 글 시각은 수강생에게 알리지 않는다. */
export function countedCardDto(card: Card, counts: Awaited<ReturnType<typeof cardCountRows>>, instructor: boolean) {
  const material = counts.find((x) => x.cardId === card.id && x.tab === "material");
  const assignment = counts.find((x) => x.cardId === card.id && x.tab === "assignment");
  const hiddenWork = card.assignmentVisibility === "instructor_only" && !instructor;
  const lasts = [material?.last, hiddenWork ? null : assignment?.last].filter((x): x is number => typeof x === "number");
  return cardDto(card, { material: material?.n ?? 0, assignment: assignment?.n ?? 0, lastPostAt: lasts.length ? Math.max(...lasts) : null });
}

/** D1은 쿼리당 바인드 값 100개까지라 나눠서 조회하고 합친다. */
export const selectIn = async <T>(ids: string[], query: (part: string[]) => Promise<T[]>) => (await Promise.all(chunks(ids).map(query))).flat();

export const lectureDto = (l: Lecture) => ({
  id: l.id,
  courseId: l.courseId,
  date: l.date,
  startTime: l.startTime,
  title: l.title,
  description: l.description,
  coverFileId: l.coverFileId,
  published: l.published === 1,
  status: l.status,
  autoClosed: l.autoClosed === 1,
});

export type LectureDto = ReturnType<typeof lectureDto>;

export const participantDto = (p: { publicId: string; nickname: string; groupId: string | null; avatarColor: number; courseId: string }) => ({
  publicId: p.publicId,
  nickname: p.nickname,
  groupId: p.groupId,
  avatarColor: p.avatarColor,
  courseId: p.courseId,
});

export const courseDto = (c: typeof courses.$inferSelect) => ({
  id: c.id,
  slug: c.slug,
  title: c.title,
  instructorName: c.instructorName,
  status: c.status,
});
