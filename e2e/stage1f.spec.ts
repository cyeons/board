import { expect, test } from "@playwright/test";
import { cardUrl, enter, png1x1, seed } from "./helpers";

test("웹 앱 매니페스트와 아이콘, 탭 제목 형식", async ({ page, request }) => {
  const res = await request.get("/board/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "보드", display: "standalone", start_url: "/board/" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).headers()["content-type"]).toContain("image/png");

  const w = await seed(request);
  await enter(page, w.slug, "탭제목");
  await expect(page).toHaveTitle(`보드 | ${w.course.title}`);
  await page.goto(`/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}`);
  await expect(page).toHaveTitle("보드 | 오늘의 강의");
});

test("홈 화면 앱으로 열면 마지막 과정으로 바로 간다", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "홈화면");
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (q.includes("standalone") ? ({ matches: true } as MediaQueryList) : real(q));
  });
  await page.goto("/board/");
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(w.slug)));
});

test("머리의 이름은 보드 첫 화면으로 간다", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "로고");
  await expect(page.getByRole("link", { name: "보드 홈으로" })).toHaveAttribute("href", "/board/");
});

test("가운뎃점을 쓰지 않는다", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "문구확인");
  await page.goto(cardUrl(w, w.cards[0].id));
  await expect(page.getByTestId("board")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("·");
});

test("동작 줄이기: 카드 스트림이 위치 이동 없이 보인다", async ({ browser, request }) => {
  const w = await seed(request);
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:4173", reducedMotion: "reduce", locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const page = await ctx.newPage();
  await enter(page, w.slug, "동작줄임");
  await page.goto(`/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}`);
  const card = page.getByTestId("card-stream").getByRole("listitem").first();
  await expect(card).toBeVisible();
  const transform = await card.locator("> div").evaluate((el) => getComputedStyle(el).transform);
  expect(transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);
  await ctx.close();
});

test.describe("카카오톡 앱 안 브라우저", () => {
  const KAKAO = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 KAKAOTALK 10.8.0";

  test("보기, 글쓰기, 사진 첨부가 되고 화면 공유는 외부 브라우저로 안내한다", async ({ browser, request }) => {
    const w = await seed(request);
    const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:4173", userAgent: KAKAO, viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    const page = await ctx.newPage();
    await enter(page, w.slug, "카톡사용자");
    await page.goto(cardUrl(w, w.cards[0].id));
    await page.getByRole("button", { name: "글쓰기", exact: true }).click();
    await page.getByLabel("제목").fill("카톡에서 쓴 글");
    await page.getByLabel("이미지 고르기").setInputFiles({ name: "사진.png", mimeType: "image/png", buffer: png1x1 });
    await page.getByRole("button", { name: "게시" }).click();
    await expect(page.locator('[data-post-title="카톡에서 쓴 글"]')).toBeVisible();

    await page.getByRole("button", { name: "도움 요청" }).click();
    await page.getByRole("menuitem", { name: "화면 보여주기" }).click();
    await expect(page.getByText("Chrome이나 Safari로 열어 주세요")).toBeVisible();
    await expect(page.getByText("새 사람으로 입장하게 돼요")).toBeVisible();
    await ctx.close();
  });
});

test("휴대폰에서 터치 대상이 44px 이상이다", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "휴대폰 전용");
  const w = await seed(request);
  await enter(page, w.slug, "터치");
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.getByLabel("제목").fill("터치 글");
  await page.getByRole("button", { name: "게시" }).click();
  const post = page.locator('[data-post-title="터치 글"]');
  await expect(post).toBeVisible();
  const targets = [
    post.getByRole("button", { name: "좋아요", exact: true }),
    post.getByRole("button", { name: "글 메뉴", exact: true }),
    post.getByRole("button", { name: "댓글 추가" }),
    page.getByRole("tab", { name: "과제" }),
    page.getByRole("button", { name: "전체 보기" }),
    page.getByRole("button", { name: /^정렬/ }),
    page.getByRole("button", { name: /에 글쓰기$/ }).first(),
  ];
  for (const target of targets) {
    const box = (await target.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
});
