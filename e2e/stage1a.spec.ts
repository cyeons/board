import { expect, test } from "@playwright/test";
import { PASSWORD, loginPage, png1x1, putFromBrowser, unique } from "./helpers";

test.skip(({ isMobile }) => isMobile, "강사 편집 화면은 컴퓨터 기준");

test("로그인 실패 안내, 로그인 후 관리자 홈, 로그아웃", async ({ page }) => {
  await page.goto("/board/admin/home");
  await expect(page).toHaveURL(/\/board\/admin$/);
  await page.getByLabel("비밀번호").fill("틀린비밀번호입니다");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("alert")).toContainText("비밀번호가 맞지 않아요");
  await loginPage(page);
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/board\/admin$/);
});

test("한글 과정을 만들고 읽을 수 있는 링크를 복사한다", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loginPage(page);
  const title = unique("한글연수");
  await page.getByRole("button", { name: "새 과정" }).click();
  await page.getByLabel("과정 이름").fill("admin");
  await expect(page.getByTestId("slug-check")).toContainText("이미 쓰이는");
  await page.getByLabel("과정 이름").fill(title);
  await expect(page.getByTestId("slug-check")).toContainText("사용할 수 있어요");
  await page.getByLabel("강사 표시 이름").fill("김강사");
  await page.getByRole("button", { name: "과정 만들기" }).click();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: "링크 복사" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`127.0.0.1:4173/board/${title.toLowerCase()}`);
});

test("강의 3개, 모둠 4개를 만들고 수정, 삭제한다. 대표 그림을 올린다", async ({ page }) => {
  await loginPage(page);
  const title = unique("관리연수");
  await page.getByRole("button", { name: "새 과정" }).click();
  await page.getByLabel("과정 이름").fill(title);
  await page.getByLabel("강사 표시 이름").fill("김강사");
  await page.getByRole("button", { name: "과정 만들기" }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  for (const name of ["1모둠", "2모둠", "3모둠", "4모둠"]) {
    await page.getByLabel("새 모둠 이름").fill(name);
    await page.getByRole("button", { name: "모둠 추가" }).click();
    await expect(page.getByLabel(`${name} 이름`)).toBeVisible();
  }
  await page.getByRole("button", { name: "4모둠 삭제" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "삭제" }).click();
  await expect(page.getByLabel("4모둠 이름")).toHaveCount(0);
  await page.getByRole("button", { name: "2모둠 위로" }).click();
  await expect(page.locator('input[aria-label$="이름"]').first()).toHaveValue("2모둠");

  for (const name of ["첫째 강의", "둘째 강의", "셋째 강의"]) {
    await page.getByRole("button", { name: "새 강의" }).click();
    await page.getByLabel("제목").fill(name);
    if (name === "첫째 강의") {
      await page.getByLabel("대표 그림 파일").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png1x1 });
      await expect(page.getByText("그림을 넣었어요")).toBeVisible();
    }
    await page.getByRole("button", { name: "강의 만들기" }).click();
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
  await page.getByRole("button", { name: "둘째 강의 메뉴" }).click();
  await page.getByRole("menuitem", { name: "정보 수정" }).click();
  await page.getByLabel("제목").fill("고친 강의");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("link", { name: "고친 강의" })).toBeVisible();

  await page.getByRole("button", { name: "셋째 강의 메뉴" }).click();
  await page.getByRole("menuitem", { name: "삭제" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "삭제" })).toBeDisabled();
  await dialog.getByLabel("강의 제목 확인").fill("셋째 강의");
  await dialog.getByRole("button", { name: "삭제" }).click();
  await expect(page.getByRole("link", { name: "셋째 강의" })).toHaveCount(0);
});

test("100MB 파일이 올라가고 원래 이름으로 내려받아진다. 101MB는 거절한다", async ({ request, page }) => {
  await page.goto("/board/");
  const origin = { origin: "http://127.0.0.1:4173" };
  await request.post("/board/api/admin/login", { data: { password: PASSWORD }, headers: origin });
  const { course } = await (await request.post("/board/api/admin/courses", { data: { title: unique("큰파일"), instructorName: "강사" }, headers: origin })).json();
  const MB = 1024 * 1024;
  const over = await request.post("/board/api/uploads", { data: { courseId: course.id, filename: "큰 파일.zip", mime: "application/zip", size: 101 * MB, category: "material" }, headers: origin });
  expect(over.status()).toBe(413);
  const started = await (await request.post("/board/api/uploads", { data: { courseId: course.id, filename: "큰 파일.zip", mime: "application/zip", size: 100 * MB, category: "material" }, headers: origin })).json();
  expect(await putFromBrowser(page, started.uploadUrl, "application/zip", 100 * MB)).toBe(200);
  expect((await request.post(`/board/api/uploads/${started.fileId}/complete`, { data: {}, headers: origin })).ok()).toBe(true);
  const { urls } = await (await request.post("/board/api/files/urls", { data: { items: [{ fileId: started.fileId, variant: "download" }] }, headers: origin })).json();
  const res = await request.get(urls[`${started.fileId}:download`], { timeout: 120_000 });
  expect(res.headers()["content-disposition"]).toContain(encodeURIComponent("큰 파일.zip"));
  expect((await res.body()).length).toBe(100 * MB);
});

test("과정 이름과 주소를 따로 정한다. 주소를 직접 고치면 이름을 바꿔도 따라가지 않는다", async ({ page }) => {
  await loginPage(page);
  await page.getByRole("button", { name: "새 과정" }).click();
  await page.getByLabel("과정 이름").fill("2026 초등 AI 연수 (1기)");
  await expect(page.getByTestId("slug-check")).toContainText("주소에는");
  const slug = unique("ai연수");
  await page.getByLabel("주소").fill(slug);
  await expect(page.getByTestId("slug-check")).toContainText("사용할 수 있어요");
  await page.getByLabel("과정 이름").fill("2026 초등 AI 연수 (2기)");
  await expect(page.getByLabel("주소")).toHaveValue(slug);
  await page.getByLabel("강사 표시 이름").fill("김강사");
  await page.getByRole("button", { name: "과정 만들기" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "2026 초등 AI 연수 (2기)" }).filter({ hasText: slug.toLowerCase() });
  await expect(row).toBeVisible();
});
