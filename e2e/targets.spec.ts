import { expect, test } from "@playwright/test";
import { cardUrl, enter, loginPage, seed } from "./helpers";

const origin = { origin: "http://127.0.0.1:4173" };
const lectureUrl = (w: { slug: string; lectureId: string }) => `/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}`;

test("카드 50개, 과제 게시물 300개에서도 열리고 스크롤이 끊기지 않는다", async ({ page, request, isMobile }) => {
  test.setTimeout(180_000);
  const w = await seed(request, { cards: Array.from({ length: 50 }, (_, i) => ({ title: `카드 ${i + 1}` })) });
  await request.post("/board/api/admin/login", { data: { password: "board-dev-1234" }, headers: origin });
  await Promise.all(
    Array.from({ length: 300 }, (_, i) =>
      request.post(`/board/api/cards/${w.cards[0].id}/posts`, {
        data: { tab: "assignment", title: `글 ${i}`, body: "본문입니다.\n두 번째 줄입니다.", attachments: [], groupId: i % 2 ? w.g1.id : w.g2.id },
        headers: origin,
      }),
    ),
  );
  await request.post("/board/api/admin/logout", { headers: origin });
  await enter(page, w.slug, "성능확인");

  await page.goto(lectureUrl(w));
  await expect(page.getByTestId("card-stream").getByRole("listitem")).toHaveCount(50);

  const started = Date.now();
  await page.goto(cardUrl(w, w.cards[0].id));
  await expect(page.getByTestId("post").first()).toBeVisible({ timeout: 20000 });
  console.log(`[${isMobile ? "phone" : "desktop"}] 게시물 300개 표시 ${Date.now() - started}ms`);
  await expect(page.getByTestId("post")).toHaveCount(300);

  // 칼럼을 끝까지 스크롤하는 동안 긴 프레임을 잰다
  const stats = await page.getByTestId("board").evaluate(async (el) => {
    let last = performance.now();
    const frames: number[] = [];
    let running = true;
    const tick = (t: number) => {
      frames.push(t - last);
      last = t;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    for (let i = 0; i < 60; i++) {
      el.scrollTop += 400;
      await new Promise((r) => requestAnimationFrame(r));
    }
    running = false;
    frames.sort((a, b) => a - b);
    return { median: frames[Math.floor(frames.length / 2)], p95: frames[Math.floor(frames.length * 0.95)], worst: frames.at(-1) };
  });
  console.log(`[${isMobile ? "phone" : "desktop"}] 스크롤 프레임`, JSON.stringify(stats));
  expect(stats.p95).toBeLessThan(100);
});

test("휴대폰에서 아래로 끌어내리면 카드 상세가 닫힌다", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "마우스 끌기로 같은 동작을 확인한다");
  const w = await seed(request);
  await enter(page, w.slug, "끌어내리기");
  await page.goto(cardUrl(w, w.cards[0].id, "material"));
  const title = page.getByRole("dialog", { name: "첫 활동" }).getByRole("heading", { name: "첫 활동" });
  await expect(title).toBeVisible();
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 200, { steps: 10 });
  await page.mouse.up();
  await expect(page).toHaveURL(new RegExp(`/l/${w.lectureId}$`));
});

test("휴대폰의 강사 화면은 시작, 종료와 도움 요청함만 보인다", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "휴대폰 전용");
  const w = await seed(request);
  await loginPage(page);
  await page.goto(lectureUrl(w));
  await expect(page.getByRole("button", { name: "종료", exact: true })).toBeVisible();
  await expect(page.getByTestId("help-tab")).toBeVisible();
  await expect(page.getByRole("button", { name: "입장 QR" })).toHaveCount(0);
  await expect(page.getByLabel("편집", { exact: true })).toHaveCount(0);
});

test("가로 화면에서 큰 강의 카드가 왼쪽 그림, 오른쪽 내용이 된다", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "휴대폰 전용");
  const w = await seed(request);
  await enter(page, w.slug, "가로세로");
  const card = page.getByTestId("big-lecture");
  const link = card.getByRole("link", { name: "오늘의 강의 들어가기" });
  await expect(card).toBeVisible();
  const portrait = (await link.boundingBox())!;
  await page.setViewportSize({ width: 760, height: 375 });
  await expect.poll(async () => (await link.boundingBox())!.x).toBeGreaterThan(portrait.x + 100);
});

test("가로로 넘치지 않는다", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "넘침확인");
  for (const url of [`/board/${encodeURIComponent(w.slug)}`, lectureUrl(w)]) {
    await page.goto(url);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("보안 헤더가 붙고 CSP 위반이 없다", async ({ page, request }) => {
  const w = await seed(request);
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  const res = await page.goto("/board/");
  const csp = res!.headers()["content-security-policy"] ?? "";
  console.log("CSP:", csp ? "적용됨" : "없음");
  expect(csp).toContain("frame-src https://www.youtube-nocookie.com");
  await enter(page, w.slug, "보안확인");
  await page.goto(cardUrl(w, w.cards[0].id));
  await expect(page.getByTestId("board")).toBeVisible();
  await page.waitForTimeout(500);
  expect(violations).toEqual([]);
});
