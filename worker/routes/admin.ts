import { zValidator } from "@hono/zod-validator";
import { and, asc, count, desc, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { adminState, attachments, cards, comments, courseSlugs, courses, files, groups, helpRequests, lectures, likes, loginAttempts, participants, posts } from "../db/schema";
import { type Card, type Lecture, type Post, loadCard, loadCourse, loadLecture, loadPost, postAudience } from "../lib/access";
import { emit, emitCourse, emitHelp } from "../lib/broadcast";
import { ADMIN_COOKIE, type AppEnv, type Db, requireInstructor } from "../lib/context";
import { cardCountRows, cardDto, chunks, countedCardDto, courseDto, hydratePost, lectureDto, selectIn } from "../lib/dto";
import { fail, notFound } from "../lib/errors";
import { hashPassword, newSalt } from "../lib/password";
import { SLUG_MESSAGES, normalizeSlug, slugProblem } from "../lib/slug";
import { safeEqual, sha256Hex, sign, ulid } from "../lib/token";
import { helpDto, helpRows } from "./help";
import { attachmentRows } from "./participant";
import { invalid } from "./validate";

const SESSION_DAYS = 30;
const LOCK_MS = 10 * 60_000;
const MAX_FAILS = 5;
const MAX_IP_FAILS = 30;

/**
 * 비밀번호를 확인하기 전에 시도 횟수를 한 번에 올리고 올린 값을 돌려준다. 동시에 몰려온 요청도 하나씩 번호를 받으므로 한도를 넘겨 확인할 수 없다.
 * 잠금 시간이 지났으면 1부터 다시 센다. 한도째 시도가 시작될 때 미리 잠그고, 그 시도가 맞으면 로그인에서 풀린다.
 */
async function bumpAttempt(db: Db, key: string, max: number, now: number) {
  const expired = sql`(${loginAttempts.lockedUntil} > 0 AND ${loginAttempts.lockedUntil} <= ${now})`;
  const row = await db
    .insert(loginAttempts)
    .values({ ipHash: key, failedCount: 1, lockedUntil: 0, updatedAt: now })
    .onConflictDoUpdate({
      target: loginAttempts.ipHash,
      set: {
        failedCount: sql`IIF(${expired}, 1, ${loginAttempts.failedCount} + 1)`,
        lockedUntil: sql`IIF(${expired}, 0, IIF(${loginAttempts.failedCount} + 1 = ${max}, ${now + LOCK_MS}, ${loginAttempts.lockedUntil}))`,
        updatedAt: now,
      },
    })
    .returning({ failedCount: loginAttempts.failedCount })
    .get();
  return row!.failedCount;
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식을 확인해 주세요.");
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "시각 형식을 확인해 주세요.");
const text = (max: number) => z.string().trim().max(max, `${max}자까지 쓸 수 있어요.`);

async function issueSession(c: Parameters<typeof setCookie>[0], secret: string, version: number) {
  const maxAge = SESSION_DAYS * 86_400;
  setCookie(c, ADMIN_COOKIE, await sign(secret, { exp: Date.now() + maxAge * 1000, v: version }), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/board",
    maxAge,
  });
}

async function slugTaken(db: Db, slug: string, exceptCourseId?: string) {
  const row = await db.select({ courseId: courseSlugs.courseId }).from(courseSlugs).where(eq(courseSlugs.slug, slug)).get();
  return Boolean(row && row.courseId !== exceptCourseId);
}

async function checkedSlug(db: Db, raw: string, exceptCourseId?: string) {
  const slug = normalizeSlug(raw);
  const problem = slugProblem(slug);
  if (problem) fail(400, "bad_slug", SLUG_MESSAGES[problem]);
  if (await slugTaken(db, slug, exceptCourseId)) fail(409, "slug_taken", "이미 쓰이는 주소예요. 다른 주소를 골라 주세요.");
  return slug;
}

/*
 * 복제. 수강생 글은 복사하지 않고, 파일은 같은 fileId를 함께 쓴다.
 * 무료 요금제는 요청 하나에 D1 쿼리 50개까지라, 카드나 게시물마다 조회하지 않고 표마다 한 번에 모아 읽는다.
 */
type PostCopy = { post: Post; id: string; lectureId: string; cardId: string | null };
/** card에는 옮겨 갈 lectureId와 sortKey를 미리 넣어 둔다. */
type CardCopy = { card: Card; id: string; shiftMs: number };
type LectureCopy = { lecture: Lecture; id: string; courseId: string; date: string; startTime: string };

async function copyPosts(db: Db, copies: PostCopy[], now: number) {
  const newIdOf = new Map(copies.map((x) => [x.post.id, x.id]));
  const atts = await selectIn([...newIdOf.keys()], (part) => db.select().from(attachments).where(inArray(attachments.postId, part)).all());
  return [
    ...copies.map((x) =>
      db.insert(posts).values({ ...x.post, id: x.id, cardId: x.cardId, lectureId: x.lectureId, likeCount: 0, commentCount: 0, instructorLiked: 0, pinnedAt: null, isLate: 0, createdAt: now, updatedAt: now, deletedAt: null }),
    ),
    ...atts.map((a) => db.insert(attachments).values({ ...a, id: ulid(now), postId: newIdOf.get(a.postId)! })),
  ];
}

/** 카드와 그 카드의 강사 자료. 과제 마감은 강의 날짜를 옮긴 만큼 함께 옮긴다. */
async function copyCards(db: Db, copies: CardCopy[], now: number) {
  const byCard = new Map(copies.map((x) => [x.card.id, x]));
  const materials = await selectIn([...byCard.keys()], (part) =>
    db.select().from(posts).where(and(inArray(posts.cardId, part), eq(posts.tab, "material"), isNull(posts.deletedAt))).all(),
  );
  return [
    ...copies.map((x) =>
      db.insert(cards).values({
        ...x.card,
        id: x.id,
        assignmentDueAt: x.card.assignmentDueAt === null ? null : x.card.assignmentDueAt + x.shiftMs,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    ),
    ...(await copyPosts(
      db,
      materials.map((m) => {
        const target = byCard.get(m.cardId!)!;
        return { post: m, id: ulid(now), lectureId: target.card.lectureId, cardId: target.id };
      }),
      now,
    )),
  ];
}

const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

async function copyLectures(db: Db, copies: LectureCopy[], now: number) {
  const byLecture = new Map(copies.map((x) => [x.lecture.id, x]));
  const noticeIds = copies.flatMap((x) => (x.lecture.noticePostId ? [x.lecture.noticePostId] : []));
  const [notices, cardRows] = await Promise.all([
    selectIn(noticeIds, (part) => db.select().from(posts).where(and(inArray(posts.id, part), isNull(posts.deletedAt))).all()),
    selectIn([...byLecture.keys()], (part) => db.select().from(cards).where(and(inArray(cards.lectureId, part), isNull(cards.deletedAt))).all()),
  ]);
  const newNoticeId = new Map(notices.map((n) => [n.id, ulid(now)]));
  return [
    ...copies.map((x) =>
      db.insert(lectures).values({
        ...x.lecture,
        id: x.id,
        courseId: x.courseId,
        date: x.date,
        startTime: x.startTime,
        published: 0,
        status: "before",
        openedAt: null,
        closedAt: null,
        autoClosed: 0,
        noticePostId: (x.lecture.noticePostId && newNoticeId.get(x.lecture.noticePostId)) || null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    ),
    ...(await copyPosts(db, notices.map((n) => ({ post: n, id: newNoticeId.get(n.id)!, lectureId: byLecture.get(n.lectureId)!.id, cardId: null })), now)),
    ...(await copyCards(
      db,
      cardRows.map((card) => {
        const target = byLecture.get(card.lectureId)!;
        return { card: { ...card, lectureId: target.id }, id: ulid(now), shiftMs: dayMs(target.date) - dayMs(target.lecture.date) };
      }),
      now,
    )),
  ];
}

/**
 * 두 이웃 사이의 순서 키. 화면의 목록이 오래되어 이웃의 순서가 뒤바뀌었거나 같으면 500 대신 다시 불러오라고 알린다.
 * ponytail: 같은 자리에 동시에 만들면 키가 겹칠 수 있다(강사 한 명이라 드묾). 그 둘 사이로는 못 옮기고 맨 위, 맨 아래로는 옮겨진다.
 * 자주 생기면 (lecture_id, sort_key) 부분 고유 인덱스와 재시도를 넣는다.
 */
function keyBetween(before: string | null, after: string | null) {
  if (before !== null && after !== null && before >= after) fail(409, "stale_order", "순서가 그새 바뀌었어요. 새로고침한 뒤 다시 옮겨 주세요.");
  return generateKeyBetween(before, after);
}

async function runBatch(db: Db, statements: unknown[]) {
  if (statements.length) await db.batch(statements as [never, ...never[]]);
}

/** 첫 강의 날짜만 새로 고르면 간격을 유지해 옮긴다. */
export function shiftDate(date: string, firstOld: string, firstNew: string): string {
  return new Date(dayMs(date) + dayMs(firstNew) - dayMs(firstOld)).toISOString().slice(0, 10);
}

const EXPORT_TABLES = [
  { name: "groups", table: groups, where: "course_id = ?1" },
  { name: "lectures", table: lectures, where: "course_id = ?1" },
  { name: "participants", table: null, where: "course_id = ?1" },
  { name: "cards", table: cards, where: "lecture_id IN (SELECT id FROM lectures WHERE course_id = ?1)" },
  { name: "posts", table: posts, where: "lecture_id IN (SELECT id FROM lectures WHERE course_id = ?1)" },
  { name: "attachments", table: attachments, where: "post_id IN (SELECT id FROM posts WHERE lecture_id IN (SELECT id FROM lectures WHERE course_id = ?1))" },
  { name: "comments", table: comments, where: "post_id IN (SELECT id FROM posts WHERE lecture_id IN (SELECT id FROM lectures WHERE course_id = ?1))" },
  { name: "likes", table: likes, where: "post_id IN (SELECT id FROM posts WHERE lecture_id IN (SELECT id FROM lectures WHERE course_id = ?1))" },
  { name: "files", table: files, where: "course_id = ?1" },
  { name: "help_requests", table: helpRequests, where: "course_id = ?1" },
] as const;

const EXPORT_PAGE = 500;

// 기본값을 스키마에 넣으면 일부만 고치는 PATCH에서 안 보낸 값까지 기본값으로 덮인다. 기본값은 만들 때만 채운다.
const cardFields = {
  emoji: text(16).min(1),
  title: text(100).min(1, "제목을 입력해 주세요."),
  summary: text(200),
  visible: z.boolean(),
  hasAssignment: z.boolean(),
  assignmentDueAt: z.number().int().nullable(),
  assignmentVisibility: z.enum(["public", "instructor_only"]),
};
const cardPatch = z.object(cardFields).partial();
const cardCreate = cardPatch.required({ title: true }).extend({ afterId: z.string().nullish() });

const lectureFields = {
  date: dateStr,
  startTime: timeStr,
  title: text(100).min(1, "제목을 입력해 주세요."),
  description: text(500),
  coverFileId: z.string().nullable(),
  published: z.boolean(),
};
const lecturePatch = z.object(lectureFields).partial();
const lectureCreate = lecturePatch.required({ date: true, startTime: true, title: true });

export const adminPublic = new Hono<AppEnv>()
  .get("/admin/me", (c) => c.json({ instructor: c.get("actor").type === "instructor" }))

  .post("/admin/login", zValidator("json", z.object({ password: z.string().max(200) }), invalid), async (c) => {
    const db = c.get("db");
    const now = Date.now();
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    // 교실은 여러 기기가 IP 하나를 함께 쓴다. 기기(IP와 브라우저) 단위로 5번에 잠가서, 학생 한 명이 틀려도 강사 기기는 잠기지 않는다.
    // 브라우저 정보를 바꿔 가며 시도하는 것은 IP 단위 30번 잠금이 막는다.
    const [deviceKey, ipKey] = await Promise.all([sha256Hex(`${ip}|${c.req.header("user-agent") ?? ""}`), sha256Hex(ip)]);
    const [device, network] = await Promise.all([bumpAttempt(db, deviceKey, MAX_FAILS, now), bumpAttempt(db, ipKey, MAX_IP_FAILS, now)]);
    const lockedMessage = "5번 틀려서 10분 동안 잠겼어요. 잠시 후 다시 시도해 주세요.";
    if (device > MAX_FAILS) fail(423, "login_locked", lockedMessage);
    if (network > MAX_IP_FAILS) fail(423, "login_locked", "이 네트워크에서 너무 많이 틀려서 10분 동안 잠겼어요. 잠시 후 다시 시도해 주세요.");

    const state = await db.select().from(adminState).where(eq(adminState.id, 1)).get();
    const salt = state?.passwordSalt ?? c.env.ADMIN_PASSWORD_SALT;
    const stored = state?.passwordHash ?? c.env.ADMIN_PASSWORD_HASH;
    const ok = Boolean(salt && stored) && (await safeEqual(await hashPassword(c.req.valid("json").password, salt), stored));

    if (!ok) return fail(401, "bad_password", device >= MAX_FAILS ? lockedMessage : "비밀번호가 맞지 않아요. 다시 입력해 주세요.");
    await db.delete(loginAttempts).where(inArray(loginAttempts.ipHash, [deviceKey, ipKey])).run();
    await issueSession(c, c.env.SESSION_SECRET, state?.sessionVersion ?? 1);
    return c.json({ ok: true });
  });

export const adminRoutes = new Hono<AppEnv>()
  .use("/admin/*", requireInstructor)

  .post("/admin/logout", (c) => {
    deleteCookie(c, ADMIN_COOKIE, { path: "/board" });
    return c.json({ ok: true });
  })

  .post("/admin/password", zValidator("json", z.object({ current: z.string().max(200), next: z.string().min(8, "비밀번호는 8자 이상으로 정해 주세요.").max(200) }), invalid), async (c) => {
    const db = c.get("db");
    const { current, next } = c.req.valid("json");
    const state = await db.select().from(adminState).where(eq(adminState.id, 1)).get();
    const salt = state?.passwordSalt ?? c.env.ADMIN_PASSWORD_SALT;
    const stored = state?.passwordHash ?? c.env.ADMIN_PASSWORD_HASH;
    if (!(await safeEqual(await hashPassword(current, salt), stored))) fail(401, "bad_password", "지금 비밀번호가 맞지 않아요.");
    const newSaltValue = newSalt();
    const version = (state?.sessionVersion ?? 1) + 1;
    const values = { sessionVersion: version, passwordHash: await hashPassword(next, newSaltValue), passwordSalt: newSaltValue };
    await db.insert(adminState).values({ id: 1, ...values }).onConflictDoUpdate({ target: adminState.id, set: values }).run();
    await issueSession(c, c.env.SESSION_SECRET, version);
    return c.json({ ok: true });
  })

  .get("/admin/slug-check", async (c) => {
    const slug = normalizeSlug(c.req.query("slug") ?? "");
    const problem = slugProblem(slug);
    if (problem) return c.json({ slug, available: false, message: SLUG_MESSAGES[problem] });
    const taken = await slugTaken(c.get("db"), slug, c.req.query("course"));
    return c.json({ slug, available: !taken, message: taken ? "이미 쓰이는 주소예요." : "사용할 수 있어요." });
  })

  .get("/admin/courses", async (c) => {
    const db = c.get("db");
    const rows = await db.select().from(courses).where(isNull(courses.deletedAt)).orderBy(desc(courses.createdAt)).all();
    const stats = await db
      .select({ courseId: lectures.courseId, n: count(), last: max(lectures.date) })
      .from(lectures)
      .where(isNull(lectures.deletedAt))
      .groupBy(lectures.courseId)
      .all();
    const used = await db.select({ n: sql<number>`COALESCE(SUM(size + COALESCE(thumb_size, 0)), 0)` }).from(files).where(isNull(files.deletedAt)).get();
    return c.json({
      usedBytes: used?.n ?? 0,
      courses: rows.map((row) => {
        const s = stats.find((x) => x.courseId === row.id);
        return { ...courseDto(row), lectureCount: s?.n ?? 0, lastLectureDate: s?.last ?? null };
      }),
    });
  })

  // 주소(slug)를 따로 주지 않으면 과정 이름을 주소로 쓴다
  .post("/admin/courses", zValidator("json", z.object({ title: text(30).min(1, "과정 이름을 입력해 주세요."), slug: z.string().max(60).optional(), instructorName: text(30).min(1, "강사 표시 이름을 입력해 주세요.") }), invalid), async (c) => {
    const db = c.get("db");
    const { title, instructorName, ...input } = c.req.valid("json");
    const slug = await checkedSlug(db, input.slug?.trim() || title);
    const id = ulid();
    const row = { id, slug, title, instructorName, status: "active" as const, createdAt: Date.now() };
    await db.batch([db.insert(courses).values(row), db.insert(courseSlugs).values({ slug, courseId: id, isCurrent: 1 })]);
    return c.json({ course: courseDto({ ...row, endedAt: null, deletedAt: null }) });
  })

  .get("/admin/courses/:id", async (c) => {
    const db = c.get("db");
    const course = await loadCourse(db, c.req.param("id"));
    const groupRows = await db.select().from(groups).where(eq(groups.courseId, course.id)).orderBy(asc(groups.position)).all();
    const lectureRows = await db.select().from(lectures).where(and(eq(lectures.courseId, course.id), isNull(lectures.deletedAt))).orderBy(asc(lectures.date), asc(lectures.startTime)).all();
    const cardCounts = await db
      .select({ lectureId: cards.lectureId, n: count() })
      .from(cards)
      .innerJoin(lectures, eq(cards.lectureId, lectures.id))
      .where(and(eq(lectures.courseId, course.id), isNull(cards.deletedAt)))
      .groupBy(cards.lectureId)
      .all();
    return c.json({
      course: courseDto(course),
      groups: groupRows.map((g) => ({ id: g.id, name: g.name, position: g.position, colorIndex: g.colorIndex })),
      lectures: lectureRows.map((l) => ({ ...lectureDto(l), cardCount: cardCounts.find((x) => x.lectureId === l.id)?.n ?? 0 })),
    });
  })

  // 이름과 주소는 따로 바뀐다. 주소를 바꾸면 옛 주소는 새 주소로 넘어간다
  .patch("/admin/courses/:id", zValidator("json", z.object({ title: text(30).min(1).optional(), slug: z.string().max(60).optional(), instructorName: text(30).min(1).optional() }), invalid), async (c) => {
    const db = c.get("db");
    const course = await loadCourse(db, c.req.param("id"));
    const input = c.req.valid("json");
    let slug = course.slug;
    const statements: unknown[] = [];
    if (input.slug !== undefined) {
      slug = await checkedSlug(db, input.slug, course.id);
      if (slug !== course.slug) {
        statements.push(
          db.update(courseSlugs).set({ isCurrent: 0 }).where(eq(courseSlugs.courseId, course.id)),
          db.insert(courseSlugs).values({ slug, courseId: course.id, isCurrent: 1 }).onConflictDoUpdate({ target: courseSlugs.slug, set: { isCurrent: 1 } }),
        );
      }
    }
    const next = { slug, title: input.title ?? course.title, instructorName: input.instructorName ?? course.instructorName };
    await db.batch([db.update(courses).set(next).where(eq(courses.id, course.id)), ...(statements as [])]);
    return c.json({ course: courseDto({ ...course, ...next }) });
  })

  .delete("/admin/courses/:id", async (c) => {
    const db = c.get("db");
    const course = await loadCourse(db, c.req.param("id"));
    await db.update(courses).set({ deletedAt: Date.now() }).where(eq(courses.id, course.id)).run();
    return c.json({ ok: true });
  })

  .post("/admin/courses/:id/end", async (c) => {
    const db = c.get("db");
    const course = await loadCourse(db, c.req.param("id"));
    const now = Date.now();
    await db.update(courses).set({ status: "ended", endedAt: now }).where(eq(courses.id, course.id)).run();
    const open = await db.select({ id: lectures.id }).from(lectures).where(and(eq(lectures.courseId, course.id), isNull(lectures.deletedAt))).all();
    for (const { id } of open) emit(c, id, { type: "lecture.status", lectureId: id, status: "course_ended" });
    return c.json({ ok: true });
  })

  .post("/admin/courses/:id/reopen", async (c) => {
    const db = c.get("db");
    const course = await loadCourse(db, c.req.param("id"));
    await db.update(courses).set({ status: "active", endedAt: null }).where(eq(courses.id, course.id)).run();
    return c.json({ ok: true });
  })

  .post("/admin/courses/:id/duplicate", zValidator("json", z.object({ title: text(30).min(1, "새 과정 이름을 입력해 주세요."), slug: z.string().max(60).optional(), firstDate: dateStr }), invalid), async (c) => {
    const db = c.get("db");
    const source = await loadCourse(db, c.req.param("id"));
    const { title, firstDate, ...input } = c.req.valid("json");
    const slug = await checkedSlug(db, input.slug?.trim() || title);
    const now = Date.now();
    const id = ulid(now);
    const statements: unknown[] = [
      db.insert(courses).values({ id, slug, title, instructorName: source.instructorName, status: "active", createdAt: now }),
      db.insert(courseSlugs).values({ slug, courseId: id, isCurrent: 1 }),
    ];
    const groupRows = await db.select().from(groups).where(eq(groups.courseId, source.id)).all();
    for (const g of groupRows) statements.push(db.insert(groups).values({ ...g, id: ulid(now), courseId: id }));
    const lectureRows = await db.select().from(lectures).where(and(eq(lectures.courseId, source.id), isNull(lectures.deletedAt))).orderBy(asc(lectures.date)).all();
    const firstOld = lectureRows[0]?.date ?? firstDate;
    statements.push(...(await copyLectures(db, lectureRows.map((l) => ({ lecture: l, id: ulid(now), courseId: id, date: shiftDate(l.date, firstOld, firstDate), startTime: l.startTime })), now)));
    await runBatch(db, statements);
    return c.json({ courseId: id, slug });
  })

  .get("/admin/courses/:id/export", zValidator("query", z.object({ cursor: z.string().optional() }), invalid), async (c) => {
    const db = c.get("db");
    const course = await loadCourse(db, c.req.param("id"));
    const [tableRaw, offsetRaw] = (c.req.valid("query").cursor ?? "0:0").split(":");
    const tableIndex = Number(tableRaw);
    const offset = Number(offsetRaw);
    const spec = EXPORT_TABLES[tableIndex];
    if (!spec) return c.json({ course: courseDto(course), table: null, rows: [], next: null });
    const columns = spec.name === "participants" ? "public_id, nickname, group_id, avatar_color, created_at" : "*";
    const { results } = await c.env.DB.prepare(`SELECT ${columns} FROM ${spec.name} WHERE ${spec.where} ORDER BY rowid LIMIT ${EXPORT_PAGE} OFFSET ?2`).bind(course.id, offset).all();
    const next = results.length === EXPORT_PAGE ? `${tableIndex}:${offset + EXPORT_PAGE}` : tableIndex + 1 < EXPORT_TABLES.length ? `${tableIndex + 1}:0` : null;
    return c.json({ course: courseDto(course), table: spec.name as string | null, rows: results as Record<string, string | number | null>[], next });
  })

  .post("/admin/courses/:id/groups", zValidator("json", z.object({ name: text(20).min(1, "모둠 이름을 입력해 주세요.") }), invalid), async (c) => {
    const db = c.get("db");
    const course = await loadCourse(db, c.req.param("id"));
    const last = await db.select({ p: max(groups.position), n: count() }).from(groups).where(eq(groups.courseId, course.id)).get();
    const row = { id: ulid(), courseId: course.id, name: c.req.valid("json").name, position: (last?.p ?? -1) + 1, colorIndex: (last?.n ?? 0) % 4 };
    await db.insert(groups).values(row).run();
    await emitCourse(c, course.id, { type: "course.update" });
    return c.json({ group: row });
  })

  .patch("/admin/groups/:id", zValidator("json", z.object({ name: text(20).min(1).optional(), position: z.number().int().optional() }), invalid), async (c) => {
    const db = c.get("db");
    const group = await db.select().from(groups).where(eq(groups.id, c.req.param("id"))).get();
    if (!group) return notFound();
    const input = c.req.valid("json");
    const statements: unknown[] = [];
    if (input.position !== undefined && input.position !== group.position) {
      const other = await db.select().from(groups).where(and(eq(groups.courseId, group.courseId), eq(groups.position, input.position), ne(groups.id, group.id))).get();
      if (other) statements.push(db.update(groups).set({ position: group.position }).where(eq(groups.id, other.id)));
    }
    const next = { name: input.name ?? group.name, position: input.position ?? group.position };
    await db.batch([db.update(groups).set(next).where(eq(groups.id, group.id)), ...(statements as [])]);
    await emitCourse(c, group.courseId, { type: "course.update" });
    return c.json({ group: { ...group, ...next } });
  })

  .delete("/admin/groups/:id", async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const group = await db.select({ courseId: groups.courseId }).from(groups).where(eq(groups.id, id)).get();
    await db.batch([
      db.delete(groups).where(eq(groups.id, id)),
      db.update(participants).set({ groupId: null }).where(eq(participants.groupId, id)),
      db.update(posts).set({ groupId: null }).where(eq(posts.groupId, id)),
    ]);
    if (group) await emitCourse(c, group.courseId, { type: "course.update" });
    return c.json({ ok: true });
  })

  .post("/admin/courses/:id/lectures", zValidator("json", lectureCreate, invalid), async (c) => {
    const db = c.get("db");
    const course = await loadCourse(db, c.req.param("id"));
    const now = Date.now();
    const input = c.req.valid("json");
    const row = {
      id: ulid(now),
      courseId: course.id,
      date: input.date,
      startTime: input.startTime,
      title: input.title,
      description: input.description ?? "",
      coverFileId: input.coverFileId ?? null,
      published: input.published ? 1 : 0,
      status: "before" as const,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(lectures).values(row).run();
    return c.json({ id: row.id });
  })

  .patch("/admin/lectures/:id", zValidator("json", lecturePatch, invalid), async (c) => {
    const db = c.get("db");
    const { lecture } = await loadLecture(db, c.req.param("id"));
    const input = c.req.valid("json");
    await db
      .update(lectures)
      .set({
        date: input.date ?? lecture.date,
        startTime: input.startTime ?? lecture.startTime,
        title: input.title ?? lecture.title,
        description: input.description ?? lecture.description,
        coverFileId: input.coverFileId === undefined ? lecture.coverFileId : input.coverFileId,
        published: input.published === undefined ? lecture.published : input.published ? 1 : 0,
        updatedAt: Date.now(),
      })
      .where(eq(lectures.id, lecture.id))
      .run();
    emit(c, lecture.id, { type: "lecture.status", lectureId: lecture.id, status: lecture.status });
    return c.json({ ok: true });
  })

  .delete("/admin/lectures/:id", async (c) => {
    const db = c.get("db");
    const { lecture } = await loadLecture(db, c.req.param("id"));
    await db.update(lectures).set({ deletedAt: Date.now() }).where(eq(lectures.id, lecture.id)).run();
    return c.json({ ok: true });
  })

  .post("/admin/lectures/:id/open", async (c) => {
    const db = c.get("db");
    const { lecture } = await loadLecture(db, c.req.param("id"));
    const now = Date.now();
    await db.update(lectures).set({ status: "open", openedAt: now, closedAt: null, autoClosed: 0, updatedAt: now }).where(eq(lectures.id, lecture.id)).run();
    emit(c, lecture.id, { type: "lecture.status", lectureId: lecture.id, status: "open" });
    return c.json({ status: "open" as const });
  })

  .post("/admin/lectures/:id/close", async (c) => {
    const db = c.get("db");
    const { lecture } = await loadLecture(db, c.req.param("id"));
    const now = Date.now();
    await db.update(lectures).set({ status: "closed", closedAt: now, updatedAt: now }).where(eq(lectures.id, lecture.id)).run();
    emit(c, lecture.id, { type: "lecture.status", lectureId: lecture.id, status: "closed" });
    return c.json({ status: "closed" as const });
  })

  // 시험 삼아 열어 본 강의를 처음 상태로 되돌린다. 게시물은 그대로 둔다
  .post("/admin/lectures/:id/reset", async (c) => {
    const db = c.get("db");
    const { lecture } = await loadLecture(db, c.req.param("id"));
    await db.update(lectures).set({ status: "before", openedAt: null, closedAt: null, autoClosed: 0, updatedAt: Date.now() }).where(eq(lectures.id, lecture.id)).run();
    emit(c, lecture.id, { type: "lecture.status", lectureId: lecture.id, status: "before" });
    return c.json({ status: "before" as const });
  })

  .post("/admin/lectures/:id/duplicate", zValidator("json", z.object({ date: dateStr, startTime: timeStr }), invalid), async (c) => {
    const db = c.get("db");
    const { lecture } = await loadLecture(db, c.req.param("id"));
    const { date, startTime } = c.req.valid("json");
    const now = Date.now();
    const id = ulid(now);
    await runBatch(db, await copyLectures(db, [{ lecture, id, courseId: lecture.courseId, date, startTime }], now));
    return c.json({ id });
  })

  .get("/admin/lectures/:id/files", async (c) => {
    const db = c.get("db");
    const { lecture } = await loadLecture(db, c.req.param("id"));
    const rows = await db
      .select({ fileId: files.id, filename: files.filename, size: files.size, category: files.category })
      .from(attachments)
      .innerJoin(posts, eq(attachments.postId, posts.id))
      .innerJoin(files, eq(attachments.fileId, files.id))
      .where(and(eq(posts.lectureId, lecture.id), isNull(posts.deletedAt), isNull(files.deletedAt)))
      .all();
    return c.json({ files: rows });
  })

  .post("/admin/lectures/:id/cards", zValidator("json", cardCreate, invalid), async (c) => {
    const db = c.get("db");
    const { lecture } = await loadLecture(db, c.req.param("id"));
    const { afterId, ...input } = c.req.valid("json");
    const list = await db.select({ id: cards.id, k: cards.sortKey }).from(cards).where(and(eq(cards.lectureId, lecture.id), isNull(cards.deletedAt))).orderBy(asc(cards.sortKey)).all();
    const at = afterId ? list.findIndex((x) => x.id === afterId) : list.length - 1;
    const sortKey = keyBetween(at >= 0 ? list[at]!.k : null, list[at + 1]?.k ?? null);
    const now = Date.now();
    const row: typeof cards.$inferSelect = {
      id: ulid(now),
      lectureId: lecture.id,
      sortKey,
      emoji: input.emoji ?? "📌",
      title: input.title,
      summary: input.summary ?? "",
      visible: input.visible ? 1 : 0,
      hasAssignment: input.hasAssignment === false ? 0 : 1,
      assignmentDueAt: input.assignmentDueAt ?? null,
      assignmentVisibility: input.assignmentVisibility ?? "public",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.insert(cards).values(row).run();
    const dto = cardDto(row);
    emit(c, lecture.id, { type: "card.upsert", card: dto, revealed: row.visible === 1 }, row.visible ? { kind: "all" } : { kind: "instructor" });
    return c.json({ card: dto });
  })

  .patch("/admin/cards/:id", zValidator("json", cardPatch, invalid), async (c) => {
    const db = c.get("db");
    const { card } = await loadCard(db, c.req.param("id"));
    const input = c.req.valid("json");
    const next: Card = {
      ...card,
      emoji: input.emoji ?? card.emoji,
      title: input.title ?? card.title,
      summary: input.summary ?? card.summary,
      visible: input.visible === undefined ? card.visible : input.visible ? 1 : 0,
      hasAssignment: input.hasAssignment === undefined ? card.hasAssignment : input.hasAssignment ? 1 : 0,
      assignmentDueAt: input.assignmentDueAt === undefined ? card.assignmentDueAt : input.assignmentDueAt,
      assignmentVisibility: input.assignmentVisibility ?? card.assignmentVisibility,
      updatedAt: Date.now(),
    };
    await db.update(cards).set(next).where(eq(cards.id, card.id)).run();
    const dto = cardDto(next);
    if (next.visible) {
      // 막 공개된 카드는 수강생 화면에 처음 들어가므로 개수를 함께 보낸다
      const shown = card.visible ? dto : countedCardDto(next, await cardCountRows(db, card.lectureId), false);
      emit(c, card.lectureId, { type: "card.upsert", card: shown, revealed: !card.visible });
    } else {
      emit(c, card.lectureId, { type: "card.upsert", card: dto }, { kind: "instructor" });
      emit(c, card.lectureId, { type: "card.remove", cardId: card.id }, { kind: "participants" });
    }
    return c.json({ card: dto });
  })

  .delete("/admin/cards/:id", async (c) => {
    const db = c.get("db");
    const { card } = await loadCard(db, c.req.param("id"));
    await db.update(cards).set({ deletedAt: Date.now() }).where(eq(cards.id, card.id)).run();
    emit(c, card.lectureId, { type: "card.remove", cardId: card.id });
    return c.json({ ok: true });
  })

  .post("/admin/cards/:id/restore", async (c) => {
    const db = c.get("db");
    const card = await db.select().from(cards).where(eq(cards.id, c.req.param("id"))).get();
    if (!card) return notFound();
    if (!card.deletedAt || Date.now() - card.deletedAt > 10_000) fail(410, "too_late", "되돌릴 수 있는 시간이 지났어요.");
    await db.update(cards).set({ deletedAt: null }).where(eq(cards.id, card.id)).run();
    const dto = countedCardDto({ ...card, deletedAt: null }, await cardCountRows(db, card.lectureId), !card.visible);
    emit(c, card.lectureId, { type: "card.upsert", card: dto }, card.visible ? { kind: "all" } : { kind: "instructor" });
    return c.json({ card: dto });
  })

  .post("/admin/cards/:id/duplicate", async (c) => {
    const db = c.get("db");
    const { card } = await loadCard(db, c.req.param("id"));
    const list = await db.select({ id: cards.id, k: cards.sortKey }).from(cards).where(and(eq(cards.lectureId, card.lectureId), isNull(cards.deletedAt))).orderBy(asc(cards.sortKey)).all();
    const at = list.findIndex((x) => x.id === card.id);
    const sortKey = keyBetween(card.sortKey, list[at + 1]?.k ?? null);
    const now = Date.now();
    const id = ulid(now);
    await runBatch(db, await copyCards(db, [{ card: { ...card, title: `${card.title} 복사본`.slice(0, 100), visible: 0, sortKey }, id, shiftMs: 0 }], now));
    const saved = (await db.select().from(cards).where(eq(cards.id, id)).get())!;
    // 자료도 함께 복사했으므로 개수를 붙인다. 강사 화면에는 처음 들어가는 카드다.
    const dto = countedCardDto(saved, await cardCountRows(db, card.lectureId), true);
    emit(c, card.lectureId, { type: "card.upsert", card: dto }, { kind: "instructor" });
    return c.json({ card: dto });
  })

  .patch("/admin/cards/:id/move", zValidator("json", z.object({ before: z.string().nullable(), after: z.string().nullable() }), invalid), async (c) => {
    const db = c.get("db");
    const { card } = await loadCard(db, c.req.param("id"));
    const { before, after } = c.req.valid("json");
    const keyOf = async (id: string | null) => (id ? ((await db.select({ k: cards.sortKey }).from(cards).where(and(eq(cards.id, id), eq(cards.lectureId, card.lectureId))).get())?.k ?? null) : null);
    const sortKey = keyBetween(...(await Promise.all([keyOf(before), keyOf(after)])));
    await db.update(cards).set({ sortKey, updatedAt: Date.now() }).where(eq(cards.id, card.id)).run();
    emit(c, card.lectureId, { type: "card.move", cardId: card.id, sortKey });
    return c.json({ sortKey });
  })

  .patch("/admin/posts/:id/move", zValidator("json", z.object({ before: z.string().nullable(), after: z.string().nullable() }), invalid), async (c) => {
    const db = c.get("db");
    const { post } = await loadPost(db, c.req.param("id"));
    const { before, after } = c.req.valid("json");
    const keyOf = async (id: string | null) => (id ? ((await db.select({ k: posts.sortKey }).from(posts).where(and(eq(posts.id, id), eq(posts.cardId, post.cardId ?? ""))).get())?.k ?? null) : null);
    const sortKey = keyBetween(...(await Promise.all([keyOf(before), keyOf(after)])));
    await db.update(posts).set({ sortKey }).where(eq(posts.id, post.id)).run();
    emit(c, post.lectureId, { type: "post.move", postId: post.id, cardId: post.cardId ?? "", sortKey });
    return c.json({ sortKey });
  })

  .on(["PUT", "DELETE"], "/admin/posts/:id/pin", async (c) => {
    const db = c.get("db");
    const { post, card, lecture, course } = await loadPost(db, c.req.param("id"));
    const pinnedAt = c.req.method === "PUT" ? Date.now() : null;
    await db.update(posts).set({ pinnedAt }).where(eq(posts.id, post.id)).run();
    const next = { ...post, pinnedAt };
    const dto = await hydratePost(db, next, { type: "anon" }, course.instructorName);
    emit(c, lecture.id, { type: "post.upsert", post: dto }, postAudience(card, next, dto.author.publicId));
    return c.json({ pinnedAt });
  })

  .put(
    "/admin/lectures/:id/notice",
    zValidator("json", z.object({ title: text(100), body: z.string().max(5000, "본문은 5000자까지 쓸 수 있어요."), attachments: z.array(z.object({ fileId: z.string() })).max(10) }), invalid),
    async (c) => {
      const db = c.get("db");
      const { lecture, course } = await loadLecture(db, c.req.param("id"));
      const input = c.req.valid("json");
      const now = Date.now();
      const postId = lecture.noticePostId ?? ulid(now);
      // 게시물과 같은 규칙: 고른 순서를 지키고, 올린 사람의 ready 파일만 붙인다
      const atts = await attachmentRows(db, c.get("actor"), postId, input.attachments);
      await db.batch([
        db
          .insert(posts)
          .values({ id: postId, cardId: null, lectureId: lecture.id, tab: "notice", authorType: "instructor", title: input.title, body: input.body, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({ target: posts.id, set: { title: input.title, body: input.body, updatedAt: now, deletedAt: null } }),
        db.update(lectures).set({ noticePostId: postId, updatedAt: now }).where(eq(lectures.id, lecture.id)),
        db.delete(attachments).where(eq(attachments.postId, postId)),
        ...atts.map((a) => db.insert(attachments).values(a)),
      ]);
      emit(c, lecture.id, { type: "notice.update", lectureId: lecture.id });
      const saved = (await db.select().from(posts).where(eq(posts.id, postId)).get())!;
      return c.json({ notice: await hydratePost(db, saved, c.get("actor"), course.instructorName) });
    },
  )

  .delete("/admin/lectures/:id/notice", async (c) => {
    const db = c.get("db");
    const { lecture } = await loadLecture(db, c.req.param("id"));
    if (lecture.noticePostId) {
      const now = Date.now();
      await db.batch([
        db.update(posts).set({ deletedAt: now }).where(eq(posts.id, lecture.noticePostId)),
        db.update(lectures).set({ noticePostId: null, updatedAt: now }).where(eq(lectures.id, lecture.id)),
      ]);
      emit(c, lecture.id, { type: "notice.update", lectureId: lecture.id });
    }
    return c.json({ ok: true });
  })

  .get("/admin/lectures/:id/presence", async (c) => {
    const { lecture } = await loadLecture(c.get("db"), c.req.param("id"));
    return c.json(await c.env.LECTURE_ROOM.getByName(lecture.id).presence());
  })

  .get("/admin/courses/:id/help", async (c) => {
    const course = await loadCourse(c.get("db"), c.req.param("id"));
    return c.json({ requests: await helpRows(c.get("db"), course.id) });
  })

  .patch("/admin/help/:id", zValidator("json", z.object({ status: z.enum(["viewing", "done"]) }), invalid), async (c) => {
    const db = c.get("db");
    const row = await db.select().from(helpRequests).where(eq(helpRequests.id, c.req.param("id"))).get();
    if (!row) return notFound();
    const { status } = c.req.valid("json");
    const person = await db.select().from(participants).where(eq(participants.id, row.participantId)).get();
    const now = Date.now();
    if (status === "viewing") {
      if (row.kind !== "live") fail(400, "invalid", "실시간 공유 요청만 볼 수 있어요.");
      // 한 번에 한 명만 본다. 다른 사람을 보면 이전 공유는 끝난다.
      const others = await db.select().from(helpRequests).where(and(eq(helpRequests.courseId, row.courseId), eq(helpRequests.status, "viewing"), ne(helpRequests.id, row.id))).all();
      for (const other of others) {
        await db.update(helpRequests).set({ status: "done", handledAt: now }).where(eq(helpRequests.id, other.id)).run();
        const owner = await db.select({ publicId: participants.publicId }).from(participants).where(eq(participants.id, other.participantId)).get();
        emitHelp(c, row.courseId, { type: "help.update", id: other.id, status: "done" });
        if (owner) emitHelp(c, row.courseId, { type: "rtc.end", helpId: other.id }, { kind: "one", publicId: owner.publicId });
      }
    }
    await db.update(helpRequests).set({ status, handledAt: status === "done" ? now : row.handledAt }).where(eq(helpRequests.id, row.id)).run();
    emitHelp(c, row.courseId, { type: "help.update", id: row.id, status });
    if (person && row.kind === "live") {
      emitHelp(c, row.courseId, { type: status === "viewing" ? "rtc.start" : "rtc.end", helpId: row.id }, { kind: "one", publicId: person.publicId });
    }
    return c.json({ request: helpDto({ ...row, status }, person) });
  })

  .post("/admin/help/:id/request-screenshot", async (c) => {
    const db = c.get("db");
    const row = await db.select().from(helpRequests).where(eq(helpRequests.id, c.req.param("id"))).get();
    if (!row) return notFound();
    const person = await db.select({ publicId: participants.publicId }).from(participants).where(eq(participants.id, row.participantId)).get();
    if (person) emitHelp(c, row.courseId, { type: "help.request_screenshot", helpId: row.id }, { kind: "one", publicId: person.publicId });
    return c.json({ ok: true });
  })

  .get("/admin/storage", async (c) => {
    const db = c.get("db");
    const courseId = c.req.query("course");
    const rows = await db
      .select({
        id: files.id,
        courseId: files.courseId,
        filename: files.filename,
        mime: files.mime,
        size: files.size,
        thumbSize: files.thumbSize,
        category: files.category,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(and(isNull(files.deletedAt), eq(files.status, "ready"), courseId ? eq(files.courseId, courseId) : undefined))
      .orderBy(desc(files.createdAt))
      .all();
    const refs = await db
      .select({ fileId: attachments.fileId, lectureId: posts.lectureId })
      .from(attachments)
      .innerJoin(posts, eq(attachments.postId, posts.id))
      .where(isNull(posts.deletedAt))
      .all();
    const covers = await db.select({ fileId: lectures.coverFileId, lectureId: lectures.id }).from(lectures).where(isNull(lectures.deletedAt)).all();
    const help = await db.select({ fileId: helpRequests.fileId, lectureId: helpRequests.lectureId }).from(helpRequests).all();
    const titles = await db.select({ id: lectures.id, title: lectures.title, date: lectures.date, courseId: lectures.courseId }).from(lectures).where(isNull(lectures.deletedAt)).all();
    const courseRows = await db.select({ id: courses.id, title: courses.title }).from(courses).where(isNull(courses.deletedAt)).all();
    const lectureOf = new Map<string, string[]>();
    for (const r of [...refs, ...covers, ...help]) {
      if (!r.fileId) continue;
      lectureOf.set(r.fileId, [...new Set([...(lectureOf.get(r.fileId) ?? []), r.lectureId])]);
    }
    return c.json({
      lectures: titles,
      courses: courseRows,
      files: rows.map((f) => ({ ...f, total: f.size + (f.thumbSize ?? 0), lectureIds: lectureOf.get(f.id) ?? [] })),
    });
  })

  .post("/admin/storage/delete", zValidator("json", z.object({ fileIds: z.array(z.string()).min(1).max(500) }), invalid), async (c) => {
    await deleteFiles(c.get("db"), c.req.valid("json").fileIds);
    return c.json({ ok: true });
  })

  .post("/admin/storage/delete-screenshots", zValidator("json", z.object({ courseId: z.string().nullish() }), invalid), async (c) => {
    const db = c.get("db");
    const { courseId } = c.req.valid("json");
    const rows = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.category, "screenshot"), isNull(files.deletedAt), courseId ? eq(files.courseId, courseId) : undefined))
      .all();
    await deleteFiles(db, rows.map((r) => r.id));
    return c.json({ deleted: rows.length });
  });

/** 저장 공간 화면에서 지울 때: 참조를 먼저 끊고 Cron의 정리 순서에 맡긴다 (plan.md 9.3). */
async function deleteFiles(db: Db, ids: string[]) {
  const now = Date.now();
  for (const part of chunks(ids)) {
    await db.batch([
      db.delete(attachments).where(inArray(attachments.fileId, part)),
      db.update(lectures).set({ coverFileId: null }).where(inArray(lectures.coverFileId, part)),
      db.update(helpRequests).set({ fileId: null, status: "done", handledAt: now }).where(inArray(helpRequests.fileId, part)),
      db.update(files).set({ deletedAt: now }).where(inArray(files.id, part)),
    ]);
  }
}

