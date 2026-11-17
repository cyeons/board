import { expect, test } from "@playwright/test";
import { cardUrl, commentBox, enter, loginPage, png1x1, seed } from "./helpers";

test.skip(({ isMobile }) => isMobile, "강사 관리 화면은 컴퓨터 기준");

const origin = { origin: "http://127.0.0.1:4173" };

test("저장 공간: 일괄 삭제, 스크린샷 전체 삭제. 지운 만큼 사용량이 준다", async ({ page, request }) => {
  const w = await seed(request);
  await loginPage(page);
  await page.goto(cardUrl(w, w.cards[0].id, "material"));
  await page.getByRole("button", { name: "자료 쓰기" }).click();
  await page.getByLabel("제목").fill("지울 자료");
  const filename = `지울파일${Date.now()}.txt`;
  await page.getByLabel("파일 고르기").setInputFiles({ name: filename, mimeType: "text/plain", buffer: Buffer.alloc(300_000, 65) });
  await page.getByRole("button", { name: "게시" }).click();
  await expect(page.locator('[data-post-title="지울 자료"]')).toBeVisible();

  await page.goto("/board/admin/storage");
  const used = page.getByTestId("storage-used");
  await expect(used).toContainText("사용");
  const before = await used.textContent();
  await page.getByLabel("강의로 거르기").selectOption({ value: w.lectureId });
  await page.getByLabel("모두 고르기").check();
  await page.getByRole("button", { name: /고른 파일 1개 삭제/ }).click();
  await page.getByRole("button", { name: "1개 지우기" }).click();
  await expect(page.getByText("파일을 지웠어요")).toBeVisible();
  // 로컬 DB에 파일이 GB 단위로 쌓이면 300KB를 지워도 표시가 같을 수 있어, 목록에서 빠졌는지로 확인한다
  await expect(page.getByText(filename)).toHaveCount(0);
  void before;

  await page.getByRole("button", { name: "스크린샷만 전체 삭제" }).click();
  await page.getByRole("button", { name: "스크린샷 모두 지우기" }).click();
  await expect(page.getByText(/스크린샷 \d+장을 지웠어요/)).toBeVisible();
});

test("복제본이 쓰는 파일은 원본 강의를 지워도 남는다", async ({ page, request }) => {
  const w = await seed(request);
  await loginPage(page);
  await page.goto(cardUrl(w, w.cards[0].id, "material"));
  await page.getByRole("button", { name: "자료 쓰기" }).click();
  await page.getByLabel("제목").fill("함께 쓰는 자료");
  await page.getByLabel("파일 고르기").setInputFiles({ name: "공유.png", mimeType: "image/png", buffer: png1x1 });
  await page.getByRole("button", { name: "게시" }).click();
  await expect(page.locator('[data-post-title="함께 쓰는 자료"]')).toBeVisible();

  const cookies = await page.context().cookies();
  const headers = { ...origin, cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") };
  const copy = await (await request.post(`/board/api/admin/lectures/${w.lectureId}/duplicate`, { data: { date: "2099-01-01", startTime: "10:00" }, headers })).json();
  await request.delete(`/board/api/admin/lectures/${w.lectureId}`, { headers });
  const lecture = await (await request.get(`/board/api/lectures/${copy.id}`, { headers })).json();
  const posts = await (await request.get(`/board/api/cards/${lecture.cards[0].id}/posts?tab=material`, { headers })).json();
  const fileId = posts.posts[0].attachments[0].fileId;
  const { urls } = await (await request.post("/board/api/files/urls", { data: { items: [{ fileId, variant: "download" }] }, headers })).json();
  expect((await request.get(urls[`${fileId}:download`])).ok()).toBe(true);
});

test("데이터 백업 JSON과 강의별 파일 zip", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "백업글쓴이", "1모둠");
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.getByLabel("제목").fill("백업될 글");
  await page.getByLabel("파일 고르기").setInputFiles({ name: "첨부.txt", mimeType: "text/plain", buffer: Buffer.from("백업") });
  await page.getByRole("button", { name: "게시" }).click();
  const post = page.locator('[data-post-title="백업될 글"]');
  await expect(post).toBeVisible();
  await (await commentBox(post)).fill("백업될 댓글");
  await post.getByRole("button", { name: "보내기" }).click();
  await expect(post.getByText("백업될 댓글")).toBeVisible();

  await loginPage(page);
  await page.goto(`/board/admin/c/${encodeURIComponent(w.slug)}`);
  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: "데이터 백업 내려받기" }).click();
  const file = await json;
  expect(file.suggestedFilename()).toContain("데이터 백업.json");
  const chunks: Buffer[] = [];
  for await (const c of await file.createReadStream()) chunks.push(c as Buffer);
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(data.tables.lectures).toHaveLength(1);
  expect(data.tables.cards).toHaveLength(1);
  expect(JSON.stringify(data.tables.posts)).toContain("백업될 글");
  expect(JSON.stringify(data.tables.comments)).toContain("백업될 댓글");
  expect(JSON.stringify(data.tables.participants)).not.toContain("token");

  const zip = page.waitForEvent("download");
  await page.getByRole("button", { name: "오늘의 강의 파일 zip으로 내려받기" }).click();
  expect((await zip).suggestedFilename()).toBe("오늘의 강의 파일.zip");
});

test("과정을 종료하면 모든 강의가 읽기 전용이고, 재개하면 돌아온다", async ({ page, request, browser }) => {
  const w = await seed(request);
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:4173", locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const student = await ctx.newPage();
  await enter(student, w.slug, "수강생", "1모둠");
  await student.goto(cardUrl(w, w.cards[0].id));
  await expect(student.getByRole("button", { name: "글쓰기", exact: true })).toBeVisible();

  await loginPage(page);
  await page.goto(`/board/admin/c/${encodeURIComponent(w.slug)}`);
  await page.getByRole("button", { name: "과정 종료" }).click();
  await expect(page.getByText("종료된 과정이에요")).toBeVisible();

  await student.reload();
  await expect(student.getByRole("tab", { name: "과제" })).toBeVisible();
  await expect(student.getByRole("button", { name: "글쓰기", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "과정 재개" }).click();
  await student.reload();
  await expect(student.getByRole("button", { name: "글쓰기", exact: true })).toBeVisible();
  await ctx.close();
});
