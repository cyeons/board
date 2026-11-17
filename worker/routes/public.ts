import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { cards, courseSlugs, courses, groups, lectures, participants, posts } from "../db/schema";
import { canSeeCard, canSeeLecture, canSeeLectureContent, isInstructor, loadCard, loadLecture } from "../lib/access";
import { emitParticipant } from "../lib/broadcast";
import { type AppEnv, participantCookie } from "../lib/context";
import { cardCountRows, cardDto, countedCardDto, courseDto, hydratePost, hydratePosts, lectureDto, participantDto } from "../lib/dto";
import { fail, forbidden, notFound } from "../lib/errors";
import { assertKeyLimit } from "../lib/ratelimit";
import { normalizeSlug } from "../lib/slug";
import { randomToken, sha256Hex, ulid } from "../lib/token";
import { invalid } from "./validate";

const COOKIE_MAX_AGE = 31_536_000;

const nickname = z.string().trim().min(2, "닉네임은 2자에서 12자로 입력해 주세요.").max(12, "닉네임은 2자에서 12자로 입력해 주세요.");

export const publicRoutes = new Hono<AppEnv>()
  .get("/health", (c) => c.json({ ok: true }))

  .get("/shortlink/:slug", async (c) => {
    const slug = normalizeSlug(c.req.param("slug"));
    const row = await c.get("db").select({ courseId: courseSlugs.courseId }).from(courseSlugs).where(eq(courseSlugs.slug, slug)).get();
    const course = row && (await c.get("db").select().from(courses).where(and(eq(courses.id, row.courseId), isNull(courses.deletedAt))).get());
    if (!course) return notFound();
    c.header("Cache-Control", "public, max-age=60");
    return c.json({ path: `/board/${course.slug}` });
  })

  .get("/courses/:slug", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const slug = normalizeSlug(c.req.param("slug"));
    const row = await db.select().from(courseSlugs).where(eq(courseSlugs.slug, slug)).get();
    if (!row) return notFound("이 주소의 과정을 찾을 수 없어요. 강사님께 받은 주소를 다시 확인해 주세요.");
    const course = await db.select().from(courses).where(and(eq(courses.id, row.courseId), isNull(courses.deletedAt))).get();
    if (!course) return notFound("이 주소의 과정을 찾을 수 없어요. 강사님께 받은 주소를 다시 확인해 주세요.");
    const groupRows = await db.select().from(groups).where(eq(groups.courseId, course.id)).orderBy(asc(groups.position)).all();
    const lectureRows = await db
      .select()
      .from(lectures)
      .where(and(eq(lectures.courseId, course.id), isNull(lectures.deletedAt)))
      .orderBy(asc(lectures.date), asc(lectures.startTime))
      .all();
    return c.json({
      redirectTo: row.isCurrent ? null : course.slug,
      course: courseDto(course),
      groups: groupRows.map((g) => ({ id: g.id, name: g.name, position: g.position, colorIndex: g.colorIndex })),
      lectures: lectureRows.filter((l) => canSeeLecture(actor, course, l)).map(lectureDto),
    });
  })

  .post(
    "/courses/:slug/join",
    zValidator("json", z.object({ nickname, groupId: z.string().nullable().optional() }), invalid),
    async (c) => {
      const db = c.get("db");
      const ip = c.req.header("cf-connecting-ip") ?? "local";
      await assertKeyLimit(c.env, "join", ip);
      const slug = normalizeSlug(c.req.param("slug"));
      const row = await db.select().from(courseSlugs).where(eq(courseSlugs.slug, slug)).get();
      const course = row && (await db.select().from(courses).where(and(eq(courses.id, row.courseId), isNull(courses.deletedAt))).get());
      if (!course) return notFound();
      const { nickname: name, groupId } = c.req.valid("json");
      if (groupId) {
        const group = await db.select().from(groups).where(and(eq(groups.id, groupId), eq(groups.courseId, course.id))).get();
        if (!group) fail(400, "bad_group", "모둠을 다시 골라 주세요.");
      }
      const token = randomToken();
      const publicId = randomToken(12);
      const now = Date.now();
      const avatarColor = [...publicId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 8;
      const row2 = {
        id: ulid(now),
        courseId: course.id,
        publicId,
        tokenHash: await sha256Hex(token),
        nickname: name,
        groupId: groupId ?? null,
        avatarColor,
        createdAt: now,
        lastSeenAt: now,
      };
      await db.insert(participants).values(row2).run();
      setCookie(c, participantCookie(course.id), token, {
        httpOnly: true,
        secure: new URL(c.req.url).protocol === "https:",
        sameSite: "Lax",
        path: "/board",
        maxAge: COOKIE_MAX_AGE,
      });
      return c.json({ token, participant: participantDto(row2) });
    },
  )

  .post("/courses/:slug/restore", async (c) => {
    const db = c.get("db");
    const slug = normalizeSlug(c.req.param("slug"));
    const row = await db.select().from(courseSlugs).where(eq(courseSlugs.slug, slug)).get();
    if (!row) return notFound();
    const token = getCookie(c, participantCookie(row.courseId));
    if (!token) return notFound("복구할 신원이 없어요.");
    const p = await db.select().from(participants).where(eq(participants.tokenHash, await sha256Hex(token))).get();
    if (!p || p.revokedAt || p.courseId !== row.courseId) return notFound("복구할 신원이 없어요.");
    return c.json({ token, participant: participantDto(p) });
  })

  .get("/me", async (c) => {
    const actor = c.get("actor");
    if (actor.type !== "participant") return forbidden("과정에 먼저 입장해 주세요.");
    return c.json({ participant: participantDto(actor.p) });
  })

  .patch(
    "/me",
    zValidator("json", z.object({ nickname: nickname.optional(), groupId: z.string().nullable().optional() }), invalid),
    async (c) => {
      const actor = c.get("actor");
      const db = c.get("db");
      if (actor.type !== "participant") return forbidden("과정에 먼저 입장해 주세요.");
      const body = c.req.valid("json");
      if (body.groupId) {
        const group = await db.select().from(groups).where(and(eq(groups.id, body.groupId), eq(groups.courseId, actor.p.courseId))).get();
        if (!group) fail(400, "bad_group", "모둠을 다시 골라 주세요.");
      }
      const next = {
        nickname: body.nickname ?? actor.p.nickname,
        groupId: body.groupId === undefined ? actor.p.groupId : body.groupId,
      };
      await db.update(participants).set(next).where(eq(participants.id, actor.p.id)).run();
      await emitParticipant(c, actor.p.courseId, { publicId: actor.p.publicId, ...next });
      return c.json({ participant: participantDto({ ...actor.p, ...next }) });
    },
  )

  .post("/me/leave", async (c) => {
    const actor = c.get("actor");
    if (actor.type !== "participant") return forbidden("과정에 먼저 입장해 주세요.");
    await c.get("db").update(participants).set({ revokedAt: Date.now() }).where(eq(participants.id, actor.p.id)).run();
    deleteCookie(c, participantCookie(actor.p.courseId), { path: "/board" });
    return c.json({ ok: true });
  })

  .get("/lectures/:id", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const { lecture, course } = await loadLecture(db, c.req.param("id"));
    c.set("courseId", course.id);
    if (!canSeeLecture(actor, course, lecture)) return notFound();
    const base = { course: courseDto(course), lecture: lectureDto(lecture) };
    if (!canSeeLectureContent(actor, course, lecture)) {
      return c.json({ ...base, locked: true, notice: null, cards: [] });
    }
    const rows = await db.select().from(cards).where(and(eq(cards.lectureId, lecture.id), isNull(cards.deletedAt))).orderBy(asc(cards.sortKey)).all();
    const counts = await cardCountRows(db, lecture.id);
    const visible = rows.filter((card) => canSeeCard(actor, course, lecture, card));
    const notice = lecture.noticePostId ? await db.select().from(posts).where(and(eq(posts.id, lecture.noticePostId), isNull(posts.deletedAt))).get() : null;
    // 수강생이 과제를 낸 카드. 카드 목록에서 "제출함"으로 보여 준다
    const mine =
      actor.type === "participant"
        ? await db
            .select({ cardId: posts.cardId })
            .from(posts)
            .where(and(eq(posts.lectureId, lecture.id), eq(posts.participantId, actor.p.id), eq(posts.tab, "assignment"), isNull(posts.deletedAt)))
            .groupBy(posts.cardId)
            .all()
        : [];
    const submitted = new Set(mine.map((m) => m.cardId));
    return c.json({
      ...base,
      locked: false,
      notice: notice ? await hydratePost(db, notice, actor, course.instructorName) : null,
      cards: visible.map((card) => ({ ...countedCardDto(card, counts, isInstructor(actor)), submitted: submitted.has(card.id) })),
    });
  })

  .get("/cards/:id", async (c) => {
    const db = c.get("db");
    const actor = c.get("actor");
    const { card, lecture, course } = await loadCard(db, c.req.param("id"));
    if (!canSeeCard(actor, course, lecture, card)) return notFound();
    return c.json({ card: cardDto(card), lecture: lectureDto(lecture), course: courseDto(course) });
  })

  .get(
    "/cards/:id/posts",
    zValidator("query", z.object({ tab: z.enum(["material", "assignment"]), sort: z.enum(["newest", "oldest", "likes"]).optional() }), invalid),
    async (c) => {
      const db = c.get("db");
      const actor = c.get("actor");
      const { tab, sort } = c.req.valid("query");
      const { card, lecture, course } = await loadCard(db, c.req.param("id"));
      if (!canSeeCard(actor, course, lecture, card)) return notFound();
      const scope = [eq(posts.cardId, card.id), eq(posts.tab, tab), isNull(posts.deletedAt)];
      if (tab === "assignment" && card.assignmentVisibility === "instructor_only" && !isInstructor(actor)) {
        if (actor.type !== "participant") return c.json({ posts: [] });
        scope.push(eq(posts.participantId, actor.p.id));
      }
      const order =
        tab === "material"
          ? [asc(posts.sortKey)]
          : sort === "oldest"
            ? [asc(posts.createdAt)]
            : sort === "likes"
              ? [desc(posts.likeCount), desc(posts.createdAt)]
              : [desc(posts.createdAt)];
      const rows = await db.select().from(posts).where(and(...scope)).orderBy(...order).all();
      return c.json({ posts: await hydratePosts(db, rows, actor, course.instructorName) });
    },
  );
