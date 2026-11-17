import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { attachments, cards, courses, files, lectures, posts } from "../db/schema";
import { assertCanWrite, canSeeLecture, canSeePost, isInstructor, loadCourse, loadLecture } from "../lib/access";
import type { Actor, AppEnv } from "../lib/context";
import { chunks, selectIn } from "../lib/dto";
import { fail, forbidden } from "../lib/errors";
import { isHttpUrl } from "../lib/links";
import { linkPreview } from "../lib/linkpreview";
import { contentDisposition, handleDevFile, presignGet, presignPut } from "../lib/r2";
import { assertKeyLimit, assertUnderLimit } from "../lib/ratelimit";
import { ulid } from "../lib/token";
import { invalid } from "./validate";

const MB = 1024 * 1024;
export const INSTRUCTOR_MAX = 100 * MB;
export const STUDENT_MAX = 50 * MB;
export const SCREENSHOT_MAX = 10 * MB;
export const THUMB_MAX = 2 * MB;
export const TOTAL_CAP = 9 * 1024 * MB;
export const URL_BATCH = 50;

const uploaderId = (a: Actor) => (a.type === "instructor" ? "instructor" : a.type === "participant" ? a.p.id : "");

/** 올린 내용이 신고한 형식과 맞는지 파일 앞부분으로 확인한다. */
export function matchesMagic(mime: string, bytes: Uint8Array): boolean {
  const starts = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  if (mime === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (mime === "image/png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (mime === "image/gif") return starts(0x47, 0x49, 0x46);
  if (mime === "image/webp") return starts(0x52, 0x49, 0x46, 0x46);
  if (mime === "application/pdf") return starts(0x25, 0x50, 0x44, 0x46);
  return true;
}

/** 화면 안에서 바로 보여 줘도 되는 형식만 고른다. SVG, HTML처럼 스크립트가 돌 수 있는 형식은 언제나 내려받기로 준다. */
const INLINE_IMAGES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);
const inlineSafe = (mime: string) => INLINE_IMAGES.has(mime) || /^video\/[a-z0-9.+-]+$/.test(mime) || mime === "application/pdf";

/** `image/SVG+xml; charset=utf-8` 같은 변형을 하나로 맞춘다. */
const normalizeMime = (mime: string) => mime.split(";")[0]!.trim().toLowerCase() || "application/octet-stream";

export const uploadRoutes = new Hono<AppEnv>()
  .post(
    "/uploads",
    zValidator(
      "json",
      z.object({
        courseId: z.string().optional(),
        lectureId: z.string().optional(),
        filename: z.string().trim().min(1).max(200),
        mime: z.string().min(1).max(120),
        size: z.number().int().positive(),
        category: z.enum(["material", "student", "screenshot", "cover"]),
        thumbSize: z.number().int().positive().max(THUMB_MAX).optional(),
      }),
      invalid,
    ),
    async (c) => {
      const db = c.get("db");
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const mime = normalizeMime(input.mime);
      let courseId: string;
      if (actor.type === "participant") {
        if (input.category !== "student" && input.category !== "screenshot") forbidden();
        if (!input.lectureId) fail(400, "invalid", "강의를 찾을 수 없어요. 페이지를 새로고침해 주세요.");
        const { lecture, course } = await loadLecture(db, input.lectureId);
        assertCanWrite(actor, course, lecture);
        courseId = course.id;
        await assertUnderLimit(db, actor, "upload");
      } else if (isInstructor(actor)) {
        if (!input.courseId) fail(400, "invalid", "과정을 찾을 수 없어요. 페이지를 새로고침해 주세요.");
        courseId = (await loadCourse(db, input.courseId)).id;
      } else {
        return forbidden("과정에 먼저 입장해 주세요.");
      }
      c.set("courseId", courseId);

      const max = input.category === "screenshot" ? SCREENSHOT_MAX : isInstructor(actor) ? INSTRUCTOR_MAX : STUDENT_MAX;
      if (input.size > max) fail(413, "too_large", `${max / MB}MB까지 올릴 수 있어요. 더 작은 파일을 골라 주세요.`);

      const used = await db.select({ n: sql<number>`COALESCE(SUM(size + COALESCE(thumb_size, 0)), 0)` }).from(files).get();
      if ((used?.n ?? 0) + input.size > TOTAL_CAP) fail(507, "storage_full", "저장 공간이 가득 찼어요. 강사님께 알려 주세요.");

      const now = new Date();
      const id = ulid(now.getTime());
      const key = `courses/${courseId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}`;
      const thumbKey = input.thumbSize ? `${key}.thumb.jpg` : null;
      await db
        .insert(files)
        .values({
          id,
          courseId,
          r2Key: key,
          filename: input.filename,
          mime,
          size: input.size,
          thumbR2Key: thumbKey,
          thumbSize: input.thumbSize ?? null,
          category: input.category,
          uploaderType: isInstructor(actor) ? "instructor" : "participant",
          uploaderId: uploaderId(actor),
          status: "pending",
          createdAt: now.getTime(),
        })
        .run();
      const origin = new URL(c.req.url).origin;
      const upload = await presignPut(c.env, origin, key, mime);
      const thumb = thumbKey ? await presignPut(c.env, origin, thumbKey, "image/jpeg") : null;
      return c.json({
        fileId: id,
        uploadUrl: upload.url,
        headers: upload.headers,
        thumbUploadUrl: thumb?.url ?? null,
        thumbHeaders: thumb?.headers ?? null,
      });
    },
  )

  .post(
    "/uploads/:fileId/complete",
    zValidator("json", z.object({ width: z.number().int().positive().nullish(), height: z.number().int().positive().nullish() }), invalid),
    async (c) => {
      const db = c.get("db");
      const actor = c.get("actor");
      const file = await db.select().from(files).where(and(eq(files.id, c.req.param("fileId")), isNull(files.deletedAt))).get();
      if (!file || file.uploaderId !== uploaderId(actor)) return forbidden();
      const reject = async (message: string) => {
        // 올린 내용은 바로 지운다. 줄은 pending으로 남겨 두어, 같은 주소로 다시 올린 파일까지 Cron이 하루 뒤 지운다.
        await c.env.FILES.delete([file.r2Key, ...(file.thumbR2Key ? [file.thumbR2Key] : [])]);
        return fail(413, "bad_upload", message);
      };
      // 앞부분만 받아도 size는 전체 크기다. 썸네일 확인과 함께 한 번에 묻는다.
      const [start, thumbHead] = await Promise.all([
        c.env.FILES.get(file.r2Key, { range: { offset: 0, length: Math.min(16, file.size) } }),
        file.thumbR2Key ? c.env.FILES.head(file.thumbR2Key) : null,
      ]);
      if (!start) return fail(400, "missing_upload", "파일이 끝까지 올라가지 않았어요. 다시 시도해 주세요.");
      const bytes = new Uint8Array(await start.arrayBuffer());
      if (start.size !== file.size) return reject("올린 파일 크기가 신고한 크기와 달라요. 다시 시도해 주세요.");
      if (!matchesMagic(file.mime, bytes)) return reject("파일 내용이 형식과 맞지 않아요. 다른 파일을 골라 주세요.");
      if (thumbHead && thumbHead.size > THUMB_MAX) return reject("썸네일이 너무 커요. 다시 시도해 주세요.");
      const { width, height } = c.req.valid("json");
      await db
        .update(files)
        .set({
          status: "ready",
          width: width ?? null,
          height: height ?? null,
          thumbR2Key: thumbHead ? file.thumbR2Key : null,
          thumbSize: thumbHead ? thumbHead.size : null,
        })
        .where(eq(files.id, file.id))
        .run();
      return c.json({ fileId: file.id, status: "ready" as const });
    },
  )

  .post(
    "/files/urls",
    zValidator(
      "json",
      z.object({ items: z.array(z.object({ fileId: z.string(), variant: z.enum(["thumb", "inline", "download"]) })).min(1).max(URL_BATCH) }),
      invalid,
    ),
    async (c) => {
      const db = c.get("db");
      const actor = c.get("actor");
      const { items } = c.req.valid("json");
      const ids = [...new Set(items.map((i) => i.fileId))];
      const fileRows = await selectIn(ids, (part) => db.select().from(files).where(inArray(files.id, part)).all());
      const allowed = new Set<string>();

      if (isInstructor(actor)) {
        for (const f of fileRows) allowed.add(f.id);
      } else {
        for (const f of fileRows) {
          if (f.category !== "screenshot" && actor.type === "participant" && f.uploaderId === actor.p.id) allowed.add(f.id);
        }
        const open = fileRows.filter((f) => f.category !== "screenshot" && !allowed.has(f.id)).map((f) => f.id);
        for (const part of chunks(open)) {
          const refs = await db
            .select({ fileId: attachments.fileId, post: posts, lecture: lectures, course: courses, card: cards })
            .from(attachments)
            .innerJoin(posts, eq(attachments.postId, posts.id))
            .innerJoin(lectures, eq(posts.lectureId, lectures.id))
            .innerJoin(courses, eq(lectures.courseId, courses.id))
            .leftJoin(cards, eq(posts.cardId, cards.id))
            .where(inArray(attachments.fileId, part))
            .all();
          for (const r of refs) {
            if (r.fileId && canSeePost(actor, r.course, r.lecture, r.card, r.post)) allowed.add(r.fileId);
          }
          const covers = await db
            .select({ lecture: lectures, course: courses })
            .from(lectures)
            .innerJoin(courses, eq(lectures.courseId, courses.id))
            .where(inArray(lectures.coverFileId, part))
            .all();
          for (const r of covers) {
            if (r.lecture.coverFileId && canSeeLecture(actor, r.course, r.lecture)) allowed.add(r.lecture.coverFileId);
          }
        }
      }

      const origin = new URL(c.req.url).origin;
      const byId = new Map(fileRows.map((f) => [f.id, f]));
      const urls: Record<string, string> = {};
      for (const { fileId, variant } of items) {
        const f = byId.get(fileId);
        if (!f || !allowed.has(fileId) || f.deletedAt) continue;
        const key = `${fileId}:${variant}`;
        if (variant === "thumb") {
          if (f.thumbR2Key) urls[key] = await presignGet(c.env, origin, f.thumbR2Key, { mime: "image/jpeg" });
          else if (inlineSafe(f.mime) && f.mime.startsWith("image/")) urls[key] = await presignGet(c.env, origin, f.r2Key, { mime: f.mime, disposition: contentDisposition("inline", f.filename) });
        } else {
          const type = variant === "inline" && inlineSafe(f.mime) ? "inline" : "attachment";
          urls[key] = await presignGet(c.env, origin, f.r2Key, { mime: f.mime, disposition: contentDisposition(type, f.filename) });
        }
      }
      return c.json({ urls });
    },
  )

  .post("/link-preview", zValidator("json", z.object({ url: z.string().max(2000).refine(isHttpUrl, "링크는 http나 https 주소만 넣을 수 있어요.") }), invalid), async (c) => {
    const actor = c.get("actor");
    if (actor.type === "anon") return forbidden("과정에 먼저 입장해 주세요.");
    if (actor.type === "participant") await assertKeyLimit(c.env, "preview", actor.p.id);
    return c.json(await linkPreview(c.req.valid("json").url));
  })

  .on(["PUT", "GET"], "/dev-files/:ticket", (c) => handleDevFile(c.env, c.req.param("ticket"), c.req.raw));
