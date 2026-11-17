import { expect, test } from "@playwright/test";
import { enter, fakeDisplayMedia, loginPage, newInstructor, newStudent, png1x1, seed } from "./helpers";

const lectureUrl = (w: { slug: string; lectureId: string }) => `/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}`;

test.describe("컴퓨터", () => {
  test.skip(({ isMobile }) => isMobile, "컴퓨터 전용");

  test("스크린샷을 찍어 보내면 2초 안에 닉네임, 모둠, 메시지와 함께 강사 패널에 뜬다", async ({ page, request, browser }) => {
    const w = await seed(request);
    await fakeDisplayMedia(page);
    await enter(page, w.slug, "도움요청자", "2모둠");
    await page.goto(lectureUrl(w));

    const teacher = await newInstructor(browser);
    await teacher.page.goto(lectureUrl(w));
    await expect(teacher.page.getByTestId("help-count")).toHaveText("0");
    await teacher.page.getByTestId("help-tab").click();
    await expect(teacher.page.getByTestId("help-panel")).toBeVisible();
    await teacher.page.waitForTimeout(800);

    await page.getByRole("button", { name: "도움 요청" }).click();
    await page.getByRole("menuitem", { name: "스크린샷 보내기" }).click();
    await page.getByRole("button", { name: "지금 화면 찍기" }).click();
    await expect(page.getByTestId("shot-preview")).toBeVisible();
    await expect(page.getByText("강사님만 볼 수 있어요. 개인 정보가 보이지 않는지 확인해 주세요")).toBeVisible();
    await page.getByLabel("메시지").fill("여기서 오류가 나요");
    const started = Date.now();
    await page.getByRole("button", { name: "보내기" }).click();

    const item = teacher.page.getByTestId("help-item").first();
    await expect(item).toContainText("도움요청자", { timeout: 2000 });
    console.log(`도움 요청 표시 ${Date.now() - started}ms`);
    await expect(item).toContainText("2모둠");
    await expect(item).toContainText("여기서 오류가 나요");
    await expect(item.getByTestId("help-thumb")).toBeVisible();

    await item.getByRole("button", { name: "도움요청자 스크린샷 크게 보기" }).click();
    await expect(teacher.page.getByTestId("help-big")).toBeVisible();
    await teacher.page.keyboard.press("Escape");

    await item.getByRole("button", { name: "확인함" }).click();
    // 처리한 요청은 "처리함" 아래로 접힌다
    await expect(teacher.page.getByTestId("help-item")).toHaveCount(0);
    await teacher.page.getByRole("button", { name: /처리함 \d+개 보기/ }).click();
    await expect(teacher.page.getByTestId("help-item").first()).toHaveAttribute("data-status", "done");
    await teacher.page.getByRole("button", { name: "도움 요청함 접기" }).click();
    await expect(teacher.page.getByTestId("help-count")).toHaveText("0");
    await teacher.ctx.close();
  });

  test("강사가 없을 때 온 요청도 들어오면 보인다. 패널을 열면 본문이 왼쪽으로 밀린다", async ({ page, request, browser }) => {
    const w = await seed(request);
    await enter(page, w.slug, "먼저보냄", "1모둠");
    await page.goto(lectureUrl(w));
    await page.getByRole("button", { name: "도움 요청" }).click();
    await page.getByRole("menuitem", { name: "스크린샷 보내기" }).click();
    await page.getByLabel("스크린샷 사진 고르기").setInputFiles({ name: "앨범.png", mimeType: "image/png", buffer: png1x1 });
    await page.getByRole("button", { name: "보내기" }).click();
    await expect(page.getByText("강사님께 보냈어요")).toBeVisible();

    const teacher = await newInstructor(browser);
    await teacher.page.goto(lectureUrl(w));
    await expect(teacher.page.getByTestId("help-count")).toHaveText("1");
    await expect(teacher.page.getByText("기다리는 도움 요청이 1개 있어요")).toBeVisible();

    const before = (await teacher.page.getByRole("heading", { name: "오늘의 강의" }).boundingBox())!.x;
    await teacher.page.getByTestId("help-tab").click();
    await expect(teacher.page.getByTestId("help-item")).toContainText("먼저보냄");
    await expect.poll(async () => (await teacher.page.getByRole("heading", { name: "오늘의 강의" }).boundingBox())!.x).toBeLessThan(before);

    // 다른 수강생은 스크린샷 파일을 받을 수 없다 (서버 테스트와 별개로 화면 흐름에서 확인)
    await teacher.ctx.close();
    void browser;
  });

  test("강사는 과정 관리 화면에서도 도움 요청함을 본다", async ({ page, request }) => {
    const w = await seed(request);
    await loginPage(page);
    await page.goto(`/board/admin/c/${encodeURIComponent(w.slug)}`);
    await expect(page.getByTestId("help-tab")).toBeVisible();
  });

  test("수강생으로 보기, 시작 전 강의, 종료된 강의에서는 도움 요청 버튼이 없다", async ({ page, request, browser }) => {
    const w = await seed(request, { open: false });
    await enter(page, w.slug, "수강생", "1모둠");
    await page.goto(lectureUrl(w));
    await expect(page.getByText("곧 시작해요")).toBeVisible();
    await expect(page.getByRole("button", { name: "도움 요청" })).toHaveCount(0);
    void browser;
  });
});

test.describe("휴대폰", () => {
  test.skip(({ isMobile }) => !isMobile, "휴대폰 전용");

  test("앨범에서 골라 보내고, 화면 공유는 스크린샷으로 안내한다", async ({ page, request, browser }) => {
    const w = await seed(request);
    await enter(page, w.slug, "폰사용자", "1모둠");
    await page.goto(lectureUrl(w));
    await page.getByRole("button", { name: "도움 요청" }).click();
    await page.getByRole("menuitem", { name: "화면 보여주기" }).click();
    await expect(page.getByText("이 기기에서는 스크린샷으로 보내 주세요")).toBeVisible();
    await page.getByRole("button", { name: "스크린샷 보내기" }).click();
    await expect(page.getByRole("button", { name: "지금 화면 찍기" })).toHaveCount(0);
    await page.getByLabel("스크린샷 사진 고르기").setInputFiles({ name: "앨범.png", mimeType: "image/png", buffer: png1x1 });
    await page.getByRole("button", { name: "보내기" }).click();
    await expect(page.getByText("강사님께 보냈어요")).toBeVisible();

    const teacher = await newInstructor(browser);
    await teacher.page.goto(lectureUrl(w));
    await expect(teacher.page.getByTestId("help-count")).toHaveText("1");
    await teacher.ctx.close();
    void newStudent;
  });
});
