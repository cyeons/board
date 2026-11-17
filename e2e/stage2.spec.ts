import { expect, test } from "@playwright/test";
import { cardUrl, enter, fakeDisplayMedia, loginPage, newInstructor, seed } from "./helpers";

test.skip(({ isMobile }) => isMobile, "화면 공유는 컴퓨터 전용");

const origin = { origin: "http://127.0.0.1:4173" };
const lectureUrl = (w: { slug: string; lectureId: string }) => `/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}`;

async function studentSharing(browser: import("@playwright/test").Browser, slug: string, url: string, nickname: string) {
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:4173", locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const page = await ctx.newPage();
  await fakeDisplayMedia(page);
  await enter(page, slug, nickname, "1모둠");
  await page.goto(url);
  await page.getByRole("button", { name: "도움 요청" }).click();
  await page.getByRole("menuitem", { name: "화면 보여주기" }).click();
  await expect(page.getByText("창 하나만 고르기를 권해요")).toBeVisible();
  await page.getByRole("button", { name: "화면 고르기" }).click();
  await expect(page.getByTestId("share-banner")).toContainText("강사님이 확인하면 연결돼요");
  return { ctx, page };
}

test("강사가 보기를 누르면 화면이 재생되고, 다른 사람을 보면 이전 공유가 끝난다", async ({ request, browser }) => {
  const w = await seed(request);
  const teacher = await newInstructor(browser);
  await teacher.page.goto(lectureUrl(w));
  await teacher.page.getByTestId("help-tab").click();

  const a = await studentSharing(browser, w.slug, lectureUrl(w), "첫째사람");
  const items = teacher.page.getByTestId("help-item");
  await expect(items).toContainText("첫째사람", { timeout: 4000 });

  await teacher.page.getByRole("button", { name: "첫째사람 화면 보기" }).click();
  await expect(a.page.getByTestId("share-banner")).toContainText("강사님이 보고 있어요", { timeout: 4000 });
  const video = teacher.page.getByTestId("live-video");
  await expect(video).toHaveAttribute("data-playing", "true", { timeout: 15000 });
  expect(await video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);

  // 옆 패널에서는 작으니 전체 화면으로 크게 본다
  await teacher.page.getByRole("button", { name: "크게 보기" }).click();
  await expect.poll(() => teacher.page.evaluate(() => document.fullscreenElement?.getAttribute("data-testid"))).toBe("live-video");
  await teacher.page.evaluate(() => document.exitFullscreen());

  // 소리는 없다
  expect(await video.evaluate((v: HTMLVideoElement) => (v.srcObject as MediaStream).getAudioTracks().length)).toBe(0);

  // 다른 사람으로 넘어가면 이전 공유가 끝난다
  const b = await studentSharing(browser, w.slug, lectureUrl(w), "둘째사람");
  await expect(items.filter({ hasText: "둘째사람" })).toBeVisible({ timeout: 4000 });
  await teacher.page.getByRole("button", { name: "둘째사람 화면 보기" }).click();
  await expect(a.page.getByTestId("share-banner")).toHaveCount(0, { timeout: 4000 });
  await expect(a.page.getByText("강사님이 화면 보기를 끝냈어요")).toBeVisible();
  await expect(b.page.getByTestId("share-banner")).toContainText("강사님이 보고 있어요", { timeout: 4000 });
  await expect(teacher.page.getByRole("region", { name: "둘째사람 화면" }).getByTestId("live-video")).toHaveAttribute("data-playing", "true", { timeout: 15000 });

  // 수강생이 중지하면 끝난다
  await b.page.getByRole("button", { name: "중지" }).click();
  await expect(b.page.getByTestId("share-banner")).toHaveCount(0);
  await expect(teacher.page.getByTestId("live-viewer")).toHaveCount(0, { timeout: 4000 });
  await a.ctx.close();
  await b.ctx.close();
  await teacher.ctx.close();
});

test("수강생이 창을 닫으면 대기열에서 사라진다", async ({ request, browser }) => {
  const w = await seed(request);
  const teacher = await newInstructor(browser);
  await teacher.page.goto(lectureUrl(w));
  await teacher.page.getByTestId("help-tab").click();
  const a = await studentSharing(browser, w.slug, lectureUrl(w), "나가는사람");
  await expect(teacher.page.getByTestId("help-item")).toContainText("나가는사람", { timeout: 4000 });
  await a.ctx.close();
  // 처리한 요청은 "처리함" 아래로 접힌다
  await expect(teacher.page.getByTestId("help-item")).toHaveCount(0, { timeout: 8000 });
  await teacher.page.getByRole("button", { name: /처리함 \d+개 보기/ }).click();
  await expect(teacher.page.getByTestId("help-item").first()).toHaveAttribute("data-status", "done");
  await teacher.ctx.close();
});

test("연결이 안 되면 안내가 뜨고 스크린샷을 요청할 수 있다", async ({ request, browser }) => {
  const w = await seed(request);
  const teacher = await newInstructor(browser);
  await teacher.page.addInitScript(() => {
    // TURN을 막은 상황: 연결이 실패 상태로 간다
    const Real = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Real {
      constructor(config?: RTCConfiguration) {
        super(config);
        setTimeout(() => {
          Object.defineProperty(this, "connectionState", { get: () => "failed" });
          this.dispatchEvent(new Event("connectionstatechange"));
          (this as unknown as { onconnectionstatechange?: () => void }).onconnectionstatechange?.();
        }, 50);
      }
      override addIceCandidate = async () => undefined;
      override set ontrack(_: unknown) {}
    } as typeof RTCPeerConnection;
  });
  await teacher.page.goto(lectureUrl(w));
  await teacher.page.getByTestId("help-tab").click();
  const a = await studentSharing(browser, w.slug, lectureUrl(w), "안되는사람");
  await expect(teacher.page.getByTestId("help-item")).toContainText("안되는사람", { timeout: 4000 });
  await teacher.page.getByRole("button", { name: "안되는사람 화면 보기" }).click();
  const viewer = teacher.page.getByTestId("live-viewer");
  await expect(viewer.getByRole("alert")).toContainText("연결이 안 돼요. 스크린샷을 요청해 보세요", { timeout: 25000 });
  await viewer.getByRole("button", { name: "스크린샷 요청" }).click();
  await expect(a.page.getByText("강사님이 스크린샷을 부탁했어요")).toBeVisible({ timeout: 4000 });
  await a.ctx.close();
  await teacher.ctx.close();
});

test("발표 모드: 화살표로 넘기고 Esc로 나간다", async ({ page, request }) => {
  const w = await seed(request);
  await request.post("/board/api/admin/login", { data: { password: "board-dev-1234" }, headers: origin });
  for (const title of ["슬라이드1", "슬라이드2", "슬라이드3"]) await request.post(`/board/api/cards/${w.cards[0].id}/posts`, { data: { tab: "material", title, body: "내용", attachments: [] }, headers: origin });
  await request.post("/board/api/admin/logout", { headers: origin });
  await loginPage(page);
  await page.goto(cardUrl(w, w.cards[0].id, "material"));
  await page.getByRole("button", { name: "발표" }).click();
  const present = page.getByTestId("present");
  await expect(present.getByRole("heading", { name: "슬라이드1" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(present.getByRole("heading", { name: "슬라이드2" })).toBeVisible();
  await expect(page.getByTestId("present-count")).toHaveText("2 / 3");
  await page.keyboard.press("ArrowLeft");
  await expect(present.getByRole("heading", { name: "슬라이드1" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(present).toHaveCount(0);
  // 카드 상세는 그대로 남는다
  await expect(page.getByRole("button", { name: "발표" })).toBeVisible();
});
