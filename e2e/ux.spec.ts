import { expect, test } from "@playwright/test";
import { cardUrl, commentBox, enter, seed } from "./helpers";

// UI/UX 리뷰(2026-11-03)에서 고친 동작

test("마감은 24시간 안이거나 지났을 때만 빨갛게 보인다", async ({ page, request }) => {
  const hour = 3_600_000;
  const w = await seed(request, {
    cards: [
      { title: "급한 과제", visible: true, assignmentDueAt: Date.now() + 3 * hour },
      { title: "넉넉한 과제", visible: true, assignmentDueAt: Date.now() + 72 * hour },
      { title: "늦은 과제", visible: true, assignmentDueAt: Date.now() - hour },
    ],
  });
  await enter(page, w.slug, "마감보기");
  await page.goto(`/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}`);
  const chip = (title: string) => page.getByRole("button", { name: `${title} 열기` }).getByText(/마감/);
  await expect(chip("급한 과제")).toHaveClass(/text-danger/);
  await expect(chip("넉넉한 과제")).toHaveClass(/text-muted/);
  await expect(chip("늦은 과제")).toHaveText(/마감 지남$/);
  await expect(chip("늦은 과제")).toHaveClass(/text-danger/);
});

test("카드 상세는 포커스를 안에 두고, 닫으면 연 카드로 돌려준다", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "키보드 조작은 컴퓨터에서 확인한다");
  const w = await seed(request);
  await enter(page, w.slug, "키보드");
  await page.goto(`/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}`);
  const opener = page.getByRole("button", { name: "첫 활동 열기" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const detail = page.locator("[data-card-detail]");
  await expect(detail).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-card-detail]")))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("글자를 고르면 크게 보기가 열리지 않고, 댓글 입력칸은 누르면 펼쳐진다", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "고르기");
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.getByLabel("본문").fill("복사할 문장입니다");
  await page.getByRole("button", { name: "게시" }).click();
  const post = page.getByTestId("post").first();
  await expect(post).toContainText("복사할 문장입니다");
  // 올리는 중의 임시 카드가 저장된 글로 바뀐 뒤에 고른다 (저장된 글에만 메뉴가 있다)
  await expect(post.getByRole("button", { name: "글 메뉴" })).toBeVisible();
  // 끌어서 글자를 고른다 (복사하려는 사람의 동작)
  const text = (await post.getByText("복사할 문장입니다").boundingBox())!;
  await page.mouse.move(text.x + 2, text.y + text.height / 2);
  await page.mouse.down();
  await page.mouse.move(text.x + text.width - 2, text.y + text.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toContain("문장");
  await page.waitForTimeout(300);
  await expect(page).not.toHaveURL(/\/p\//);

  await expect(post.getByLabel("댓글 추가")).toHaveCount(0);
  const box = await commentBox(post);
  await expect(box).toBeFocused();
  await box.blur();
  await expect(post.getByLabel("댓글 추가")).toHaveCount(0);
});

test("파일을 올린 글은 저장되면 알려 주고, 휴대폰에서는 알림이 화면 아래에 뜬다", async ({ page, request, isMobile }) => {
  const w = await seed(request);
  await enter(page, w.slug, "업로드");
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.getByLabel("파일 고르기").setInputFiles({ name: "보고서.txt", mimeType: "text/plain", buffer: Buffer.from("내용") });
  await page.getByRole("button", { name: "게시" }).click();
  const toast = page.getByText("올렸어요. 이제 모두에게 보여요.");
  await expect(toast).toBeVisible();
  const box = (await toast.boundingBox())!;
  const height = page.viewportSize()!.height;
  if (isMobile) expect(box.y).toBeGreaterThan(height / 2);
  else expect(box.y).toBeLessThan(height / 2);
});

test("아래로 스크롤하면 글쓰기 버튼이 아이콘만 남고, 위로 올리면 다시 펼쳐진다", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "스크롤");
  await page.goto(cardUrl(w, w.cards[0].id, "material"));
  const origin = { origin: "http://127.0.0.1:4173" };
  await request.post("/board/api/admin/login", { data: { password: "board-dev-1234" }, headers: origin });
  for (let i = 0; i < 8; i++) await request.post(`/board/api/cards/${w.cards[0].id}/posts`, { data: { tab: "assignment", title: `글 ${i}`, body: "내용\n".repeat(8), attachments: [] }, headers: origin });
  await request.post("/board/api/admin/logout", { headers: origin });
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page.getByTestId("post")).toHaveCount(8);
  const fab = page.getByRole("button", { name: "글쓰기", exact: true });
  const wide = (await fab.boundingBox())!.width;
  const scroller = page.locator("[data-card-detail] .overflow-y-auto").first();
  await scroller.evaluate((el) => el.scrollBy({ top: 400 }));
  await page.waitForTimeout(150);
  await scroller.evaluate((el) => el.scrollBy({ top: 300 }));
  await expect.poll(async () => (await fab.boundingBox())!.width).toBeLessThan(wide - 30);
  await scroller.evaluate((el) => el.scrollBy({ top: -300 }));
  await expect.poll(async () => (await fab.boundingBox())!.width).toBeGreaterThan(wide - 4);
});
