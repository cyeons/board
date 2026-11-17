import { expect, test } from "@playwright/test";

test("앱이 열리고 API가 응답한다", async ({ page, request }) => {
  await page.goto("/board/");
  await expect(page).toHaveTitle(/보드/);
  expect((await (await request.get("/board/api/health")).json()).ok).toBe(true);
});

test("브라우저 오류를 서버로 보고한다", async ({ page }) => {
  await page.goto("/board/");
  const sent = page.waitForRequest((r) => r.url().endsWith("/board/api/client-errors") && r.method() === "POST");
  await page.evaluate(() => setTimeout(() => { throw new Error("일부러 낸 오류"); }));
  const body = (await sent).postDataJSON();
  expect(body.message).toContain("일부러 낸 오류");
});

test("토큰이 화면에 적용된다", async ({ page }) => {
  await page.goto("/board/");
  const value = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  expect(value.toLowerCase()).toBe("#1877c0");
  const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  expect(scheme).toBe("light");
});
