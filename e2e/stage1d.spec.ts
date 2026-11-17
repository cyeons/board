import { expect, test } from "@playwright/test";
import { cardUrl, commentBox, enter, loginPage, newStudent, seed } from "./helpers";

test.skip(({ isMobile }) => isMobile, "강사 편집은 컴퓨터 기준. 휴대폰 강사 범위는 따로 확인한다");

const lectureUrl = (w: { slug: string; lectureId: string }) => `/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}`;

test("글, 댓글, 좋아요가 브라우저 두 개에서 1초 안에 반영된다", async ({ page, request, browser }) => {
  const w = await seed(request);
  await enter(page, w.slug, "보는사람", "2모둠");
  await page.goto(cardUrl(w, w.cards[0].id));
  await expect(page.getByTestId("board")).toBeVisible();
  await page.waitForTimeout(800); // 웹소켓 연결 대기

  const writer = await newStudent(browser, w.slug, "쓰는사람", "1모둠");
  await writer.page.goto(cardUrl(w, w.cards[0].id));
  await writer.page.waitForTimeout(800);
  await writer.page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await writer.page.getByLabel("제목").fill("실시간 글");
  const started = Date.now();
  await writer.page.getByRole("button", { name: "게시" }).click();
  const post = page.locator('[data-post-title="실시간 글"]');
  await expect(post).toBeVisible({ timeout: 2000 });
  console.log(`글 반영 ${Date.now() - started}ms`);

  const mine = writer.page.locator('[data-post-title="실시간 글"]');
  await (await commentBox(mine)).fill("실시간 댓글");
  await mine.getByRole("button", { name: "보내기" }).click();
  await expect(post.getByText("실시간 댓글")).toBeVisible({ timeout: 2000 });

  await mine.getByRole("button", { name: "좋아요", exact: true }).click();
  await expect(post.getByTestId("like-count")).toHaveText("1", { timeout: 2000 });

  // 닉네임을 바꾸면 이전 글에도 반영된다
  await writer.page.getByRole("button", { name: "닫기" }).first().click();
  await writer.page.getByRole("button", { name: "쓰는사람 메뉴" }).click();
  await writer.page.getByRole("menuitem", { name: "닉네임 바꾸기" }).click();
  await writer.page.getByLabel("새 닉네임").fill("새이름");
  await writer.page.getByRole("button", { name: "저장" }).click();
  await expect(post.getByText("새이름").first()).toBeVisible({ timeout: 2000 });
  await writer.ctx.close();
});

test("네트워크를 끊었다 붙여도 화면이 맞는다", async ({ page, request, browser, context }) => {
  const w = await seed(request);
  await enter(page, w.slug, "끊기는사람", "2모둠");
  await page.goto(cardUrl(w, w.cards[0].id));
  await expect(page.getByTestId("board")).toBeVisible();
  await page.waitForTimeout(800);

  await context.setOffline(true);
  await page.waitForTimeout(500);
  const writer = await newStudent(browser, w.slug, "쓰는사람", "1모둠");
  await writer.page.goto(cardUrl(w, w.cards[0].id));
  await writer.page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await writer.page.getByLabel("제목").fill("끊긴 동안 쓴 글");
  await writer.page.getByRole("button", { name: "게시" }).click();
  await expect(writer.page.locator('[data-post-title="끊긴 동안 쓴 글"]')).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator('[data-post-title="끊긴 동안 쓴 글"]')).toBeVisible({ timeout: 15000 });
  await writer.ctx.close();
});

test("강사 도구: 시작 전 안내, 시작, 종료하면 쓰기 버튼이 즉시 사라지고 다시 열 수 있다", async ({ page, request, browser }) => {
  const w = await seed(request, { open: false });
  const student = await newStudent(browser, w.slug, "수강생", "1모둠");
  await student.page.goto(lectureUrl(w));
  await expect(student.page.getByText("곧 시작해요")).toBeVisible();

  await loginPage(page);
  await page.goto(lectureUrl(w));
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByRole("button", { name: "종료", exact: true })).toBeVisible();

  await student.page.reload();
  await expect(student.page.getByTestId("card-stream")).toBeVisible();
  await student.page.getByRole("button", { name: "첫 활동 열기" }).click();
  await student.page.getByRole("tab", { name: "과제" }).click();
  const fab = student.page.getByRole("button", { name: "글쓰기", exact: true });
  await expect(fab).toBeVisible();
  await student.page.waitForTimeout(800);

  await page.getByRole("button", { name: "종료", exact: true }).click();
  await expect(fab).toHaveCount(0, { timeout: 3000 });
  await expect(student.page.getByLabel("댓글 추가")).toHaveCount(0);
  await expect(student.page.getByRole("button", { name: "댓글 추가" })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "다시 열기" })).toBeVisible();
  await page.getByRole("button", { name: "다시 열기" }).click();
  await expect(fab).toBeVisible({ timeout: 3000 });
  await student.ctx.close();
});

test("접속 현황은 강사에게만, 모둠별로 보인다", async ({ page, request, browser }) => {
  const w = await seed(request);
  const a = await newStudent(browser, w.slug, "가나", "1모둠");
  const b = await newStudent(browser, w.slug, "다라", "2모둠");
  await a.page.goto(lectureUrl(w));
  await b.page.goto(lectureUrl(w));
  await expect(a.page.getByTestId("presence")).toHaveCount(0);
  await loginPage(page);
  await page.goto(lectureUrl(w));
  await expect(page.getByTestId("presence")).toContainText("지금 2명 접속 중");
  await page.getByTestId("presence").click();
  const dialog = page.getByRole("dialog", { name: "접속 중 2명" });
  await expect(dialog).toContainText("1모둠 1명");
  await expect(dialog).toContainText("가나");
  await expect(dialog).toContainText("다라");
  await page.keyboard.press("Escape");
  await b.ctx.close();
  await expect(page.getByTestId("presence")).toContainText("지금 1명 접속 중", { timeout: 5000 });
  await a.ctx.close();
});

test("입장 QR은 전체 화면으로 뜨고 Esc로 닫힌다. 수강생으로 보기는 숨긴 카드와 도구를 감춘다", async ({ page, request }) => {
  const w = await seed(request, { cards: [{ title: "보이는 카드" }, { title: "숨긴 카드", visible: false }] });
  await loginPage(page);
  await page.goto(lectureUrl(w));
  await page.getByRole("button", { name: "입장 QR" }).click();
  const qr = page.getByTestId("qr");
  await expect(qr).toContainText(`/board/${w.slug}`);
  await expect(qr.getByRole("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(qr).toHaveCount(0);

  await expect(page.getByText("숨긴 카드")).toBeVisible();
  await page.getByLabel("수강생으로 보기").click();
  await expect(page.getByText("숨긴 카드")).toHaveCount(0);
  await expect(page.getByLabel("편집", { exact: true })).not.toBeChecked();
});

test("인라인 편집: 추가, 수정, 드래그 순서, 공개, 공지. 수업 중 수강생 화면이 즉시 바뀐다", async ({ page, request, browser }) => {
  const w = await seed(request, { cards: [{ title: "첫째" }, { title: "둘째" }] });
  const student = await newStudent(browser, w.slug, "수강생", "1모둠");
  await student.page.goto(lectureUrl(w));
  await expect(student.page.getByTestId("card-stream").getByRole("listitem")).toHaveCount(2);
  await student.page.waitForTimeout(800);

  await loginPage(page);
  await page.goto(lectureUrl(w));
  await page.getByLabel("편집", { exact: true }).click();
  await expect(page.getByTestId("edit-stream")).toBeVisible();

  // 카드 추가 (숨긴 채로 만들어진다)
  await page.getByRole("button", { name: "카드 추가" }).last().click();
  await page.getByLabel("제목").fill("셋째");
  await page.getByLabel("한 줄 설명").fill("새 카드 설명");
  await page.getByRole("button", { name: "이모지 🎯" }).click();
  await page.getByRole("button", { name: "카드 만들기" }).click();
  const third = page.locator('[data-card-title="셋째"]');
  await expect(third).toBeVisible();
  await expect(student.page.getByText("셋째")).toHaveCount(0);

  // 공개하면 수강생 화면에 떠오르고 알림이 뜬다
  await page.getByRole("switch", { name: "셋째 공개" }).click();
  await expect(student.page.getByRole("button", { name: "셋째 열기" })).toBeVisible({ timeout: 3000 });
  await expect(student.page.getByText("새 카드가 공개됐어요")).toBeVisible();

  // 드래그로 순서를 바꾼다
  const handle = page.getByRole("button", { name: "셋째 순서 옮기기" });
  const target = page.locator('[data-card-title="첫째"]');
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 20, { steps: 5 });
  await page.mouse.move(to.x + 20, to.y + 2, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(page.getByTestId("edit-card").first()).toHaveAttribute("data-card-title", "셋째");
  await expect(student.page.getByTestId("card-stream").getByRole("listitem").first()).toContainText("셋째", { timeout: 3000 });

  // 수정
  await page.getByRole("button", { name: "둘째 메뉴" }).click();
  await page.getByRole("menuitem", { name: "수정" }).click();
  await page.getByLabel("제목").fill("고친 둘째");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(student.page.getByRole("button", { name: "고친 둘째 열기" })).toBeVisible({ timeout: 3000 });

  // 숨기면 수강생 화면에서 사라진다
  await page.getByRole("switch", { name: "고친 둘째 공개" }).click();
  await expect(student.page.getByRole("button", { name: "고친 둘째 열기" })).toHaveCount(0, { timeout: 3000 });

  // 복제, 삭제, 실행 취소
  await page.getByRole("button", { name: "첫째 메뉴" }).click();
  await page.getByRole("menuitem", { name: "복제" }).click();
  await expect(page.locator('[data-card-title="첫째 복사본"]')).toBeVisible();
  await page.getByRole("button", { name: "첫째 복사본 메뉴" }).click();
  await page.getByRole("menuitem", { name: "삭제" }).click();
  await expect(page.locator('[data-card-title="첫째 복사본"]')).toHaveCount(0);
  await page.getByRole("button", { name: "실행 취소" }).click();
  await expect(page.locator('[data-card-title="첫째 복사본"]')).toBeVisible();

  // 공지
  await page.getByRole("button", { name: "공지 쓰기" }).click();
  await page.getByLabel("공지 제목").fill("오늘 공지");
  await page.getByLabel("공지 본문").fill("준비물을 확인해 주세요");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(student.page.getByTestId("notice")).toContainText("오늘 공지", { timeout: 3000 });
  await student.ctx.close();
});

test("게시물 고정: 맨 위, 테두리. 강사 댓글과 좋아요는 작성자에게만 알림", async ({ page, request, browser }) => {
  const w = await seed(request);
  const a = await newStudent(browser, w.slug, "작성자", "1모둠");
  await a.page.goto(cardUrl(w, w.cards[0].id));
  for (const title of ["먼저 쓴 글", "나중 쓴 글"]) {
    await a.page.getByRole("button", { name: "글쓰기", exact: true }).click();
    await a.page.getByLabel("제목").fill(title);
    await a.page.getByRole("button", { name: "게시" }).click();
    await expect(a.page.locator(`[data-post-title="${title}"]`)).toBeVisible();
  }
  const b = await newStudent(browser, w.slug, "옆사람", "2모둠");
  await b.page.goto(cardUrl(w, w.cards[0].id));
  await expect(b.page.locator('[data-post-title="먼저 쓴 글"]')).toBeVisible();
  await b.page.waitForTimeout(800);
  await a.page.waitForTimeout(800);

  await loginPage(page);
  await page.goto(cardUrl(w, w.cards[0].id));
  const post = page.locator('[data-post-title="먼저 쓴 글"]');
  await post.getByRole("button", { name: "글 메뉴" }).click();
  await page.getByRole("menuitem", { name: "고정", exact: true }).click();
  await expect(page.getByTestId("post").first()).toHaveAttribute("data-post-title", "먼저 쓴 글");
  await expect(a.page.getByTestId("post").first()).toHaveAttribute("data-post-title", "먼저 쓴 글", { timeout: 3000 });
  expect(await a.page.getByTestId("post").first().evaluate((el) => getComputedStyle(el).boxShadow)).toContain("rgb(24, 119, 192)");

  await (await commentBox(post)).fill("잘했어요");
  await post.getByRole("button", { name: "보내기" }).click();
  await expect(a.page.getByText("강사님이 내 글에 댓글을 달았어요")).toBeVisible({ timeout: 3000 });
  await post.getByRole("button", { name: "좋아요", exact: true }).click();
  await expect(a.page.getByText("강사님이 내 글에 좋아요를 눌렀어요")).toBeVisible({ timeout: 3000 });
  await expect(a.page.locator('[data-post-title="먼저 쓴 글"]').getByTestId("instructor-liked")).toBeVisible();
  await expect(b.page.getByText("강사님이 내 글에")).toHaveCount(0);
  await a.ctx.close();
  await b.ctx.close();
});

test("자료 게시물을 끌어서 순서를 바꾼다", async ({ page, request }) => {
  const w = await seed(request);
  const origin = { origin: "http://127.0.0.1:4173" };
  await request.post("/board/api/admin/login", { data: { password: "board-dev-1234" }, headers: origin });
  for (const title of ["자료A", "자료B"]) await request.post(`/board/api/cards/${w.cards[0].id}/posts`, { data: { tab: "material", title, body: "", attachments: [] }, headers: origin });
  await request.post("/board/api/admin/logout", { headers: origin });
  await loginPage(page);
  await page.goto(cardUrl(w, w.cards[0].id, "material"));
  await expect(page.getByTestId("material-sort")).toBeVisible();
  const handle = page.getByRole("button", { name: "자료B 순서 옮기기" });
  const target = page.locator('[data-post-title="자료A"]');
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + 10, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y - 20, { steps: 5 });
  await page.mouse.move(to.x, to.y + 2, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(page.getByTestId("post").first()).toHaveAttribute("data-post-title", "자료B");
  await page.reload();
  await expect(page.getByTestId("post").first()).toHaveAttribute("data-post-title", "자료B");
});

test("강의 복제와 과정 복제가 화면에서 된다", async ({ page, request }) => {
  const w = await seed(request);
  await loginPage(page);
  await page.goto(`/board/admin/c/${encodeURIComponent(w.slug)}`);
  await page.getByRole("button", { name: "오늘의 강의 메뉴" }).click();
  await page.getByRole("menuitem", { name: "복제" }).click();
  await page.getByRole("button", { name: "복제하기" }).click();
  await expect(page.getByRole("link", { name: "오늘의 강의" })).toHaveCount(2);

  await page.getByRole("button", { name: "과정 복제" }).click();
  const title = `복제${Date.now().toString(36)}`;
  await page.getByLabel("새 과정 이름").fill(title);
  await page.getByRole("button", { name: "복제하기" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByLabel("1모둠 이름")).toBeVisible();
  await expect(page.getByRole("link", { name: "오늘의 강의" })).toHaveCount(2);
});
