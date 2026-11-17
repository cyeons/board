import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { Hono } from "hono";
import { z } from "zod";
import { attachments, comments, files, groups, likes, participants, posts } from "../db/schema";
import { type Post, assertCanWrite, canSeePost, isInstructor, loadCard, loadPost, postAudience } from "../lib/access";
import { emit } from "../lib/broadcast";
import type { Actor, AppEnv, Db } from "../lib/context";
import { hydrateComments, hydratePost } from "../lib/dto";
import { fail, forbidden, notFound } from "../lib/errors";
import { isHttpUrl, linkProvider } from "../lib/links";
import { assertUnderLimit } from "../lib/ratelimit";
import { ulid } from "../lib/token";
import { invalid } from "./validate";

const UNDO_WINDOW_MS = 10_000;

const attachmentInput = z.union([
  z.object({ fileId: z.string() }),
  z.object({
    url: z.string().max(2000).refine(isHttpUrl, "링크는 http나 https 주소만 넣을 수 있어요."),
    title: z.string().max(200).nullish(),
    description: z.string().max(300).nullish(),
    image: z.string().max(2000).refine(isHttpUrl).nullish(),
    site: z.string().max(100).nullish(),
  }),
]);

const postFields = {
  title: z.string().trim().max(100, "제목은 100자까지 쓸 수 있어요."),
  body: z.string().max(5000, "본문은 5000자까지 쓸 수 있어요."),
  attachments: z.array(attachmentInput).max(10, "첨부는 글 하나에 10개까지 넣을 수 있어요."),
};

type AttachmentInput = z.infer<typeof attachmentInput>;

const kindOf = (mime: string) =>
  mime.startsWith("image/") ? ("image" as const) : mime.startsWith("video/") ? ("video" as const) : mime === "application/pdf" ? ("pdf" as const) : ("file" as const);

const uploaderIdOf = (actor: Actor) => (actor.type === "instructor" ? "instructor" : actor.type === "participant" ? actor.p.id : "");

/** 요청한 사람이 올린 `ready` 파일만 연결한다 (plan.md 10.3 파일 소유권). */
export async function ownedReadyFiles(db: Db, actor: Actor, ids: string[]) {
  if (!ids.length) return new Map<string, typeof files.$inferSelect>();
  const rows = await db.select().from(files).where(inArray(files.id, ids)).all();
  const map = new Map(rows.map((f) => [f.id, f]));
  for (const id of ids) {
    const f = map.get(id);
    if (!f || f.status !== "ready" || f.deletedAt || f.uploaderId !== uploaderIdOf(actor)) {
      fail(400, "bad_file", "첨부 파일을 다시 올려 주세요.");
    }
  }
  return map;
}

export async function attachmentRows(db: Db, actor: Actor, postId: string, items: AttachmentInput[]) {
  const ids = items.flatMap((a) => ("fileId" in a ? [a.fileId] : []));
  // 글을 고칠 때 이미 붙어 있던 파일은 다시 확인하지 않는다. 강사가 수강생 글을 고치는 경우가 있다.
  const kept = ids.length ? await db.select({ id: attachments.fileId, kind: attachments.kind }).from(attachments).where(and(eq(attachments.postId, postId), inArray(attachments.fileId, ids))).all() : [];
  const keptKind = new Map(kept.map((k) => [k.id, k.kind]));
  const owned = await ownedReadyFiles(db, actor, ids.filter((id) => !keptKind.has(id)));
  return items.map((a, position) =>
    "fileId" in a
      ? { id: ulid(), postId, kind: keptKind.get(a.fileId) ?? kindOf(owned.get(a.fileId)!.mime), fileId: a.fileId, position }
      : {
          id: ulid(),
          postId,
          kind: "link" as const,
          url: a.url,
          linkTitle: a.title ?? null,
          linkDescription: a.description ?? null,
          linkImage: a.image ?? null,
          linkSite: a.site ?? null,
          linkProvider: linkProvider(a.url),
          position,
        },
  );
}

async function authorPublicId(db: Db, post: Post) {
  if (!post.participantId) return null;
  const row = await db.select({ publicId: participants.publicId }).from(participants).where(eq(participants.id, post.participantId)).get();
  return row?.publicId ?? null;
}

function assertOwnPost(actor: Actor, post: Post) {
  if (isInstructor(actor)) return;
  if (actor.type !== "participant" || actor.p.id !== post.participantId) forbidden("내가 쓴 글만 고칠 수 있어요.");
}

function recountComments(db: Db, postId: string, now: number) {
  return db
    .update(posts)
    .set({
      commentCount: sql`(SELECT COUNT(*) FROM comments WHERE post_id = ${postId} AND deleted_at IS NULL)`,
      updatedAt: now,
    })
    .where(eq(posts.id, postId));
}

function recountLikes(db: Db, postId: string) {
  return db
    .update(posts)
    .set({
      likeCount: sql`(SELECT COUNT(*) FROM likes WHERE post_id = ${postId})`,
      instructorLiked: sql`(SELECT COUNT(*) FROM likes WHERE post_id = ${postId} AND is_instructor = 1)`,
    })
    .where(eq(posts.id, postId));
}

export const participantRoutes = new Hono<AppEnv>()
  .post(
    "/cards/:id/posts",
    zValidator("json", z.object({ tab: z.enum(["material", "assignment"]), groupId: z.string().nullish(), ...postFields }), invalid),
    async (c) => {
      const db = c.get("db");
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const { card, lecture, course } = await loadCard(db, c.req.param("id"));
      c.set("courseId", course.id);
      assertCanWrite(actor, course, lecture);
      if (!isInstructor(actor)) {
        if (input.tab !== "assignment") forbidden("자료는 강사만 올릴 수 있어요.");
        if (!card.visible) notFound();
        if (!card.hasAssignment) forbidden("이 카드에는 과제를 올릴 수 없어요.");
      }
      if (!input.title && !input.body.trim() && !input.attachments.length) fail(400, "empty", "내용을 입력하거나 파일을 첨부해 주세요.");
      await assertUnderLimit(db, actor, "post");

      let groupId: string | null = null;
      if (input.tab === "assignment") {
        if (isInstructor(actor)) {
          groupId = input.groupId ?? null;
          if (groupId) {
            const g = await db.select().from(groups).where(and(eq(groups.id, groupId), eq(groups.courseId, course.id))).get();
            if (!g) fail(400, "bad_group", "모둠을 다시 골라 주세요.");
          }
        } else if (actor.type === "participant") {
          groupId = actor.p.groupId;
        }
      }

      let sortKey: string | null = null;
      if (input.tab === "material") {
        const last = await db
          .select({ k: posts.sortKey })
          .from(posts)
          .where(and(eq(posts.cardId, card.id), eq(posts.tab, "material"), isNull(posts.deletedAt)))
          .orderBy(desc(posts.sortKey))
          .limit(1)
          .get();
        sortKey = generateKeyBetween(last?.k ?? null, null);
      }

      const now = Date.now();
      const id = ulid(now);
      const row: typeof posts.$inferInsert = {
        id,
        cardId: card.id,
        lectureId: lecture.id,
        tab: input.tab,
        authorType: isInstructor(actor) ? "instructor" : "participant",
        participantId: actor.type === "participant" ? actor.p.id : null,
        groupId,
        title: input.title,
        body: input.body,
        sortKey,
        isLate: input.tab === "assignment" && card.assignmentDueAt && now > card.assignmentDueAt ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      };
      const atts = await attachmentRows(db, actor, id, input.attachments);
      await db.batch([db.insert(posts).values(row), ...atts.map((a) => db.insert(attachments).values(a))]);

      const saved = (await db.select().from(posts).where(eq(posts.id, id)).get())!;
      const dto = await hydratePost(db, saved, actor, course.instructorName);
      emit(c, lecture.id, { type: "post.upsert", post: dto, created: true }, postAudience(card, saved, actor.type === "participant" ? actor.p.publicId : null));
      return c.json({ post: dto });
    },
  )

  .get("/posts/:id", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const { post, card, lecture, course } = await loadPost(db, c.req.param("id"));
    if (!canSeePost(actor, course, lecture, card, post)) return notFound();
    return c.json({ post: await hydratePost(db, post, actor, course.instructorName) });
  })

  .patch("/posts/:id", zValidator("json", z.object(postFields).partial(), invalid), async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const input = c.req.valid("json");
    const { post, card, lecture, course } = await loadPost(db, c.req.param("id"));
    assertOwnPost(actor, post);
    assertCanWrite(actor, course, lecture);
    const now = Date.now();
    const statements = [] as unknown[];
    if (input.attachments) {
      const atts = await attachmentRows(db, actor, post.id, input.attachments);
      statements.push(db.delete(attachments).where(eq(attachments.postId, post.id)), ...atts.map((a) => db.insert(attachments).values(a)));
    }
    await db.batch([
      db
        .update(posts)
        .set({ title: input.title ?? post.title, body: input.body ?? post.body, updatedAt: now })
        .where(eq(posts.id, post.id)),
      ...(statements as []),
    ]);
    const saved = (await db.select().from(posts).where(eq(posts.id, post.id)).get())!;
    const dto = await hydratePost(db, saved, actor, course.instructorName);
    emit(c, lecture.id, { type: "post.upsert", post: dto }, postAudience(card, saved, dto.author.publicId));
    return c.json({ post: dto });
  })

  .delete("/posts/:id", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const { post, card, lecture, course } = await loadPost(db, c.req.param("id"));
    assertOwnPost(actor, post);
    assertCanWrite(actor, course, lecture);
    await db.update(posts).set({ deletedAt: Date.now() }).where(eq(posts.id, post.id)).run();
    emit(c, lecture.id, { type: "post.remove", postId: post.id, cardId: post.cardId, tab: post.tab }, postAudience(card, post, await authorPublicId(db, post)));
    return c.json({ ok: true });
  })

  .post("/posts/:id/restore", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const { post, card, lecture, course } = await loadPost(db, c.req.param("id"), { includeDeleted: true });
    assertOwnPost(actor, post);
    assertCanWrite(actor, course, lecture);
    if (!post.deletedAt || Date.now() - post.deletedAt > UNDO_WINDOW_MS) fail(410, "too_late", "되돌릴 수 있는 시간이 지났어요.");
    await db.update(posts).set({ deletedAt: null }).where(eq(posts.id, post.id)).run();
    const restored = { ...post, deletedAt: null };
    const dto = await hydratePost(db, restored, actor, course.instructorName);
    emit(c, lecture.id, { type: "post.upsert", post: dto, created: true }, postAudience(card, restored, dto.author.publicId));
    return c.json({ post: dto });
  })

  .get("/posts/:id/comments", async (c) => {
    const db = c.get("db");
    const { post, card, lecture, course } = await loadPost(db, c.req.param("id"));
    if (!canSeePost(c.get("actor"), course, lecture, card, post)) return notFound();
    const rows = await db.select().from(comments).where(and(eq(comments.postId, post.id), isNull(comments.deletedAt))).orderBy(asc(comments.createdAt)).all();
    return c.json({ comments: await hydrateComments(db, rows, course.instructorName) });
  })

  .post(
    "/posts/:id/comments",
    zValidator("json", z.object({ body: z.string().trim().min(1, "댓글 내용을 입력해 주세요.").max(1000, "댓글은 1000자까지 쓸 수 있어요.") }), invalid),
    async (c) => {
      const db = c.get("db");
      const actor = c.get("actor");
      const { post, card, lecture, course } = await loadPost(db, c.req.param("id"));
      if (!canSeePost(actor, course, lecture, card, post)) return notFound();
      assertCanWrite(actor, course, lecture);
      await assertUnderLimit(db, actor, "comment");
      const now = Date.now();
      const row: typeof comments.$inferSelect = {
        id: ulid(now),
        postId: post.id,
        authorType: isInstructor(actor) ? "instructor" : "participant",
        participantId: actor.type === "participant" ? actor.p.id : null,
        body: c.req.valid("json").body,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await db.batch([db.insert(comments).values(row), recountComments(db, post.id, now)]);
      const after = (await db.select({ n: posts.commentCount }).from(posts).where(eq(posts.id, post.id)).get())!;
      const [dto] = await hydrateComments(db, [row], course.instructorName);
      const ownerPublicId = await authorPublicId(db, post);
      emit(c, lecture.id, { type: "comment.upsert", comment: dto, commentCount: after.n }, postAudience(card, post, ownerPublicId));
      if (isInstructor(actor) && ownerPublicId) {
        emit(c, lecture.id, { type: "notify", kind: "instructor_comment", postId: post.id, cardId: post.cardId }, { kind: "one", publicId: ownerPublicId });
      }
      return c.json({ comment: dto! });
    },
  )

  .patch(
    "/comments/:id",
    zValidator("json", z.object({ body: z.string().trim().min(1, "댓글 내용을 입력해 주세요.").max(1000, "댓글은 1000자까지 쓸 수 있어요.") }), invalid),
    async (c) => {
      const db = c.get("db");
      const actor = c.get("actor");
      const comment = await db.select().from(comments).where(and(eq(comments.id, c.req.param("id")), isNull(comments.deletedAt))).get();
      if (!comment) return notFound();
      if (!isInstructor(actor) && (actor.type !== "participant" || actor.p.id !== comment.participantId)) forbidden("내가 쓴 댓글만 고칠 수 있어요.");
      const { post, card, lecture, course } = await loadPost(db, comment.postId);
      assertCanWrite(actor, course, lecture);
      const updated = { ...comment, body: c.req.valid("json").body, updatedAt: Date.now() };
      await db.update(comments).set({ body: updated.body, updatedAt: updated.updatedAt }).where(eq(comments.id, comment.id)).run();
      const [dto] = await hydrateComments(db, [updated], course.instructorName);
      emit(c, lecture.id, { type: "comment.upsert", comment: dto, commentCount: post.commentCount }, postAudience(card, post, await authorPublicId(db, post)));
      return c.json({ comment: dto! });
    },
  )

  .delete("/comments/:id", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const comment = await db.select().from(comments).where(and(eq(comments.id, c.req.param("id")), isNull(comments.deletedAt))).get();
    if (!comment) return notFound();
    if (!isInstructor(actor) && (actor.type !== "participant" || actor.p.id !== comment.participantId)) forbidden("내가 쓴 댓글만 지울 수 있어요.");
    const { post, card, lecture, course } = await loadPost(db, comment.postId);
    assertCanWrite(actor, course, lecture);
    const now = Date.now();
    await db.batch([db.update(comments).set({ deletedAt: now }).where(eq(comments.id, comment.id)), recountComments(db, post.id, post.updatedAt)]);
    const after = (await db.select({ n: posts.commentCount }).from(posts).where(eq(posts.id, post.id)).get())!;
    emit(c, lecture.id, { type: "comment.remove", commentId: comment.id, postId: post.id, commentCount: after.n }, postAudience(card, post, await authorPublicId(db, post)));
    return c.json({ ok: true });
  })

  .post("/comments/:id/restore", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const comment = await db.select().from(comments).where(eq(comments.id, c.req.param("id"))).get();
    if (!comment) return notFound();
    if (!isInstructor(actor) && (actor.type !== "participant" || actor.p.id !== comment.participantId)) forbidden("내가 쓴 댓글만 되살릴 수 있어요.");
    const { post, card, lecture, course } = await loadPost(db, comment.postId);
    assertCanWrite(actor, course, lecture);
    if (!comment.deletedAt || Date.now() - comment.deletedAt > UNDO_WINDOW_MS) fail(410, "too_late", "되돌릴 수 있는 시간이 지났어요.");
    await db.batch([db.update(comments).set({ deletedAt: null }).where(eq(comments.id, comment.id)), recountComments(db, post.id, post.updatedAt)]);
    const after = (await db.select({ n: posts.commentCount }).from(posts).where(eq(posts.id, post.id)).get())!;
    const [dto] = await hydrateComments(db, [{ ...comment, deletedAt: null }], course.instructorName);
    emit(c, lecture.id, { type: "comment.upsert", comment: dto, commentCount: after.n }, postAudience(card, post, await authorPublicId(db, post)));
    return c.json({ comment: dto! });
  })

  .put("/posts/:id/like", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const { post, card, lecture, course } = await loadPost(db, c.req.param("id"));
    if (!canSeePost(actor, course, lecture, card, post)) return notFound();
    assertCanWrite(actor, course, lecture);
    const instructor = isInstructor(actor);
    const likerKey = instructor ? "instructor" : (actor as Extract<Actor, { type: "participant" }>).p.id;
    await db.batch([
      db.insert(likes).values({ postId: post.id, likerKey, isInstructor: instructor ? 1 : 0, createdAt: Date.now() }).onConflictDoNothing(),
      recountLikes(db, post.id),
    ]);
    const after = (await db.select({ n: posts.likeCount, i: posts.instructorLiked }).from(posts).where(eq(posts.id, post.id)).get())!;
    const ownerPublicId = await authorPublicId(db, post);
    emit(c, lecture.id, { type: "like.update", postId: post.id, count: after.n, instructorLiked: after.i === 1 }, postAudience(card, post, ownerPublicId));
    if (instructor && ownerPublicId) {
      emit(c, lecture.id, { type: "notify", kind: "instructor_like", postId: post.id, cardId: post.cardId }, { kind: "one", publicId: ownerPublicId });
    }
    return c.json({ count: after.n, instructorLiked: after.i === 1, liked: true });
  })

  .delete("/posts/:id/like", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const { post, card, lecture, course } = await loadPost(db, c.req.param("id"));
    if (!canSeePost(actor, course, lecture, card, post)) return notFound();
    assertCanWrite(actor, course, lecture);
    const likerKey = isInstructor(actor) ? "instructor" : (actor as Extract<Actor, { type: "participant" }>).p.id;
    await db.batch([db.delete(likes).where(and(eq(likes.postId, post.id), eq(likes.likerKey, likerKey))), recountLikes(db, post.id)]);
    const after = (await db.select({ n: posts.likeCount, i: posts.instructorLiked }).from(posts).where(eq(posts.id, post.id)).get())!;
    emit(c, lecture.id, { type: "like.update", postId: post.id, count: after.n, instructorLiked: after.i === 1 }, postAudience(card, post, await authorPublicId(db, post)));
    return c.json({ count: after.n, instructorLiked: after.i === 1, liked: false });
  })

  .get("/posts/:id/likes", async (c) => {
    const db = c.get("db");
    const { post, card, lecture, course } = await loadPost(db, c.req.param("id"));
    if (!canSeePost(c.get("actor"), course, lecture, card, post)) return notFound();
    const rows = await db
      .select({ isInstructor: likes.isInstructor, nickname: participants.nickname })
      .from(likes)
      .leftJoin(participants, eq(likes.likerKey, participants.id))
      .where(eq(likes.postId, post.id))
      .orderBy(asc(likes.createdAt))
      .all();
    return c.json({ likers: rows.map((r) => ({ name: r.isInstructor ? course.instructorName : (r.nickname ?? "알 수 없음"), isInstructor: r.isInstructor === 1 })) });
  });
