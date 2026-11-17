import { type APIRequestContext, type Browser, type Locator, type Page, expect } from "@playwright/test";

export const PASSWORD = "board-dev-1234";
export const API = "/board/api";

let n = 0;
export const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${n++}`;

export async function loginPage(page: Page) {
  await page.goto("/board/admin");
  await page.getByLabel("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/board\/admin\/home/);
}

/** API로 준비한 과정, 모둠, 진행 중인 강의, 공개 카드 */
export async function seed(request: APIRequestContext, opts: { open?: boolean; cards?: { title: string; visible?: boolean; assignmentVisibility?: string; hasAssignment?: boolean; emoji?: string; assignmentDueAt?: number }[]; date?: string } = {}) {
  const origin = { origin: "http://127.0.0.1:4173" };
  const json = async (res: Awaited<ReturnType<APIRequestContext["post"]>>) => {
    if (!res.ok()) throw new Error(`${res.url()} ${res.status()} ${await res.text()}`);
    return res.json();
  };
  await json(await request.post(`${API}/admin/login`, { data: { password: PASSWORD }, headers: origin }));
  const title = unique("연수");
  const { course } = await json(await request.post(`${API}/admin/courses`, { data: { title, instructorName: "김강사" }, headers: origin }));
  const g1 = (await json(await request.post(`${API}/admin/courses/${course.id}/groups`, { data: { name: "1모둠" }, headers: origin }))).group;
  const g2 = (await json(await request.post(`${API}/admin/courses/${course.id}/groups`, { data: { name: "2모둠" }, headers: origin }))).group;
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const { id: lectureId } = await json(await request.post(`${API}/admin/courses/${course.id}/lectures`, { data: { date: opts.date ?? today, startTime: "09:00", title: "오늘의 강의", description: "설명입니다", published: true }, headers: origin }));
  const cards = [];
  for (const c of opts.cards ?? [{ title: "첫 활동", visible: true }]) {
    cards.push((await json(await request.post(`${API}/admin/lectures/${lectureId}/cards`, { data: { visible: true, ...c }, headers: origin }))).card);
  }
  if (opts.open ?? true) await json(await request.post(`${API}/admin/lectures/${lectureId}/open`, { headers: origin }));
  await request.post(`${API}/admin/logout`, { headers: origin });
  return { course, slug: course.slug as string, g1, g2, lectureId: lectureId as string, cards, today };
}

/** 첫 입장을 화면으로 진행한다. */
export async function enter(page: Page, slug: string, nickname = "수강생", group: string | null = "1모둠") {
  await page.goto(`/board/${encodeURIComponent(slug)}`);
  await page.getByLabel("닉네임").fill(nickname);
  if (group) await page.getByRole("radio", { name: group }).check({ force: true });
  await page.getByRole("button", { name: "입장하기" }).click();
  await expect(page.getByRole("button", { name: "입장하기" })).toHaveCount(0);
}

export async function newStudent(browser: Browser, slug: string, nickname: string, group: string | null = "1모둠") {
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:4173", locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const page = await ctx.newPage();
  await enter(page, slug, nickname, group);
  return { ctx, page };
}

export async function newInstructor(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:4173", locale: "ko-KR", timezoneId: "Asia/Seoul", viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await loginPage(page);
  return { ctx, page };
}

export const png1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** 한 쪽짜리 최소 PDF */
export const tinyPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj\n4 0 obj<</Length 27>>stream\n0 0 1 rg 20 20 160 160 re f\nendstream endobj\ntrailer<</Root 1 0 R/Size 5>>\n%%" + "EOF\n",
);

/** 카드 상세에 바로 들어간다 */
/** 접혀 있는 댓글 입력칸을 펼치고 돌려준다 */
export async function commentBox(scope: Locator) {
  const input = scope.getByLabel("댓글 추가");
  if (!(await input.count())) await scope.getByRole("button", { name: "댓글 추가" }).first().click();
  return input;
}

export const cardUrl = (w: { slug: string; lectureId: string }, cardId: string, tab = "assignment") => `/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}/c/${cardId}?tab=${tab}`;

/** 실제와 같이 브라우저에서 파일을 올린다. */
export async function putFromBrowser(page: Page, url: string, mime: string, size: number) {
  return page.evaluate(
    async ({ url, mime, size }) => (await fetch(url, { method: "PUT", headers: { "content-type": mime }, body: new Blob([new Uint8Array(size).fill(55)]) })).status,
    { url, mime, size },
  );
}

/** 화면 선택 창 대신 캔버스 영상을 돌려준다. */
export async function fakeDisplayMedia(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 200;
      const ctx = canvas.getContext("2d")!;
      let n = 0;
      setInterval(() => {
        ctx.fillStyle = n++ % 2 ? "#2E6C96" : "#24705F";
        ctx.fillRect(0, 0, 320, 200);
      }, 100);
      ctx.fillStyle = "#2E6C96";
      ctx.fillRect(0, 0, 320, 200);
      return canvas.captureStream(15);
    };
  });
}

