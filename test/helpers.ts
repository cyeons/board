import { SELF } from "cloudflare:test";

export const BASE = "http://example.com/board/api";
export const ORIGIN = "http://example.com";
export const PASSWORD = "test-password-1";

type Init = { method?: string; body?: unknown; token?: string; cookie?: string; origin?: string | null; ip?: string; ua?: string };

export async function call(path: string, init: Init = {}) {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.cookie) headers.cookie = init.cookie;
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  if (init.ip) headers["cf-connecting-ip"] = init.ip;
  if (init.ua) headers["user-agent"] = init.ua;
  const res = await SELF.fetch(BASE + path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 본문이 JSON이 아닐 수 있다
  }
  return { status: res.status, json, headers: res.headers };
}

let counter = 0;
export const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${counter++}`;

/** 강사 로그인 쿠키를 받는다. */
export async function loginAdmin(): Promise<string> {
  const res = await call("/admin/login", { body: { password: PASSWORD }, ip: unique("login-") });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.json)}`);
  return cookieFrom(res.headers, "board_admin");
}

export function cookieFrom(headers: Headers, name: string): string {
  for (const line of headers.getSetCookie()) {
    if (line.startsWith(`${name}`)) return line.split(";")[0]!;
  }
  throw new Error(`no cookie ${name}`);
}

export type World = {
  admin: string;
  courseId: string;
  slug: string;
  lectureId: string;
  cardId: string;
  groupA: string;
  groupB: string;
};

/** 과정 하나, 모둠 둘, 진행 중인 공개 강의 하나, 공개 카드 하나 */
export async function world(opts: { open?: boolean; published?: boolean; cardVisible?: boolean; visibility?: "public" | "instructor_only" } = {}): Promise<World> {
  const admin = await loginAdmin();
  const title = unique("과정");
  const created = await call("/admin/courses", { cookie: admin, body: { title, instructorName: "김강사" } });
  const courseId = created.json.course.id;
  const groupA = (await call(`/admin/courses/${courseId}/groups`, { cookie: admin, body: { name: "1모둠" } })).json.group.id;
  const groupB = (await call(`/admin/courses/${courseId}/groups`, { cookie: admin, body: { name: "2모둠" } })).json.group.id;
  const lectureId = (
    await call(`/admin/courses/${courseId}/lectures`, {
      cookie: admin,
      body: { date: "2026-11-01", startTime: "09:00", title: "첫 강의", published: opts.published ?? true },
    })
  ).json.id;
  const cardId = (
    await call(`/admin/lectures/${lectureId}/cards`, {
      cookie: admin,
      body: { title: "활동", visible: opts.cardVisible ?? true, assignmentVisibility: opts.visibility ?? "public" },
    })
  ).json.card.id;
  if (opts.open ?? true) await call(`/admin/lectures/${lectureId}/open`, { cookie: admin, body: {} });
  return { admin, courseId, slug: created.json.course.slug, lectureId, cardId, groupA, groupB };
}

export async function join(w: World, nickname = "수강생", groupId: string | null = w.groupA) {
  const res = await call(`/courses/${encodeURIComponent(w.slug)}/join`, { body: { nickname, groupId }, ip: unique("ip-") });
  if (res.status !== 200) throw new Error(`join failed ${res.status} ${JSON.stringify(res.json)}`);
  return { token: res.json.token as string, me: res.json.participant, cookie: cookieFrom(res.headers, `board_p_${w.courseId}`) };
}

export const assignment = (title = "제목", extra: Record<string, unknown> = {}) => ({ tab: "assignment", title, body: "본문", attachments: [], ...extra });

/** 파일을 끝까지 올린다 (실제 환경에서는 브라우저가 R2로 직접 PUT). */
export async function upload(
  auth: { token?: string; cookie?: string },
  ctx: { lectureId?: string; courseId?: string },
  opts: { category?: string; mime?: string; bytes?: Uint8Array; filename?: string; thumb?: boolean } = {},
) {
  const bytes = opts.bytes ?? new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const mime = opts.mime ?? "image/png";
  const started = await call("/uploads", {
    ...auth,
    body: { ...ctx, filename: opts.filename ?? "사진.png", mime, size: bytes.byteLength, category: opts.category ?? "student", thumbSize: opts.thumb ? 3 : undefined },
  });
  if (started.status !== 200) return { started, completed: null, fileId: null as string | null };
  await SELF.fetch(started.json.uploadUrl, { method: "PUT", headers: { "content-type": mime }, body: bytes });
  if (opts.thumb) await SELF.fetch(started.json.thumbUploadUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: new Uint8Array([1, 2, 3]) });
  const completed = await call(`/uploads/${started.json.fileId}/complete`, { ...auth, body: {} });
  return { started, completed, fileId: started.json.fileId as string };
}
