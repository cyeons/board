import { expect, test } from "@playwright/test";
import { enter, seed, unique } from "./helpers";

test("/board 안내 화면이 이전에 들어간 과정 바로가기를 보여 준다", async ({ page, request }) => {
  const w = await seed(request);
  await page.goto("/board/");
  await expect(page.getByText("강사님께 받은 연수 주소로 들어와 주세요")).toBeVisible();
  await enter(page, w.slug, "가나다");
  await page.goto("/board/");
  await expect(page.getByRole("link", { name: w.course.title })).toBeVisible();
});

test("첫 입장: 닉네임 2자 미만은 막고, 입장하면 신원이 남는다", async ({ page, request }) => {
  const w = await seed(request);
  await page.goto(`/board/${encodeURIComponent(w.slug)}`);
  await expect(page.getByRole("heading", { name: w.course.title })).toBeVisible();
  await page.getByLabel("닉네임").fill("가");
  await page.getByRole("button", { name: "입장하기" }).click();
  await expect(page.getByRole("button", { name: "입장하기" })).toBeVisible();
  await page.getByLabel("닉네임").fill("가나다");
  await page.getByRole("radio", { name: "1모둠" }).check({ force: true });
  await page.getByRole("button", { name: "입장하기" }).click();
  await expect(page.getByTestId("big-lecture")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("big-lecture")).toBeVisible();
  await expect(page.getByRole("button", { name: "입장하기" })).toHaveCount(0);
});

test("localStorage가 지워져도 복구 쿠키로 같은 사람이 돌아오고, 다른 사람으로 입장하면 끝난다", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "복구될사람");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("button", { name: "복구될사람 메뉴" })).toBeVisible();
  await page.getByRole("button", { name: "복구될사람 메뉴" }).click();
  await page.getByRole("menuitem", { name: "다른 사람으로 입장하기" }).click();
  await page.getByRole("button", { name: "나가기" }).click();
  await expect(page.getByRole("button", { name: "입장하기" })).toBeVisible();
  await expect(page.getByLabel("닉네임")).toHaveValue("");
  await page.reload();
  await expect(page.getByRole("button", { name: "입장하기" })).toBeVisible();
});

test("과정 홈: 오늘, 다가오는, 지난 강의 세 경우", async ({ page, request }) => {
  const origin = { origin: "http://127.0.0.1:4173" };
  const today = await seed(request);
  await enter(page, today.slug, "홈보기");
  await expect(page.getByTestId("big-lecture")).toContainText("오늘의 강의");
  await expect(page.getByTestId("big-lecture")).toContainText("진행 중");

  const future = await seed(request, { open: false, date: "2099-03-01" });
  await enter(page, future.slug, "홈보기");
  await expect(page.getByTestId("big-lecture")).toContainText("다가오는 강의");
  await page.getByRole("link", { name: "오늘의 강의 들어가기" }).click();
  await expect(page.getByText("곧 시작해요")).toBeVisible();

  const past = await seed(request, { open: false, date: "2020-03-01" });
  await enter(page, past.slug, "홈보기");
  await expect(page.getByText("오늘은 강의가 없어요")).toBeVisible();
  await page.getByRole("button", { name: "지난 강의 살펴보기" }).click();
  await expect(page.getByTestId("past-lectures").getByRole("listitem")).toHaveCount(1);
  void origin;
});

test("옛 주소로 들어오면 새 주소로 넘어간다", async ({ page, request }) => {
  const origin = { origin: "http://127.0.0.1:4173" };
  const w = await seed(request);
  await request.post("/board/api/admin/login", { data: { password: "board-dev-1234" }, headers: origin });
  const renamed = unique("새이름");
  // 이름과 주소는 따로 바뀐다. 주소를 바꿔야 옛 주소가 새 주소로 넘어간다
  await request.patch(`/board/api/admin/courses/${w.course.id}`, { data: { slug: renamed }, headers: origin });
  await request.post("/board/api/admin/logout", { headers: origin });
  await page.goto(`/board/${encodeURIComponent(w.slug)}`);
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(renamed)));
});

test("강의 페이지: 한 줄 스트림, 카드 상세, 고유 주소, 탭, 칼럼, 내 모둠", async ({ page, request }) => {
  const w = await seed(request, { cards: [{ title: "첫째 카드", emoji: "📚" }, { title: "둘째 카드" }, { title: "숨긴 카드", visible: false }] });
  await enter(page, w.slug, "수강생", "2모둠");
  await page.goto(`/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}`);
  await expect(page).toHaveTitle(`보드 | 오늘의 강의`);
  const stream = page.getByTestId("card-stream");
  await expect(stream.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("숨긴 카드")).toHaveCount(0);

  // 한 줄에 카드 하나, 최대 720px
  const boxes = await stream.getByRole("listitem").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width })));
  expect(boxes[0]!.x).toBe(boxes[1]!.x);
  expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y);
  expect(boxes[0]!.w).toBeLessThanOrEqual(720);

  await page.getByRole("button", { name: "첫째 카드 열기" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${w.cards[0].id}`));
  const detail = page.getByRole("dialog", { name: "첫째 카드" });
  await expect(detail.getByRole("tab", { name: "자료" })).toHaveAttribute("aria-selected", "true");
  await detail.getByRole("tab", { name: "과제" }).click();
  await expect(page).toHaveURL(/tab=assignment/);

  // 칼럼, 칼럼 머리, 내 모둠에만 + 버튼
  await expect(detail.getByTestId("column-header")).toHaveCount(2);
  await expect(detail.getByRole("button", { name: "2모둠에 글쓰기" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "1모둠에 글쓰기" })).toHaveCount(0);

  // 고유 주소로 바로 열린다
  await page.reload();
  await expect(page.getByRole("dialog", { name: "첫째 카드" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "과제" })).toHaveAttribute("aria-selected", "true");

  // 닫으면 강의 페이지로 돌아간다
  await page.getByRole("button", { name: "닫기" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/l/${w.lectureId}$`));
});

test("칼럼 머리는 세로 스크롤에도 위에 붙어 있고, 넓은 화면에서 내 모둠으로 스크롤한다", async ({ page, request, isMobile }) => {
  const origin = { origin: "http://127.0.0.1:4173" };
  const w = await seed(request);
  await request.post("/board/api/admin/login", { data: { password: "board-dev-1234" }, headers: origin });
  for (let i = 0; i < 6; i++) await request.post(`/board/api/admin/courses/${w.course.id}/groups`, { data: { name: `추가${i}` }, headers: origin });
  const last = (await (await request.get(`/board/api/admin/courses/${w.course.id}`)).json()).groups.at(-1);
  for (let i = 0; i < 8; i++) {
    await request.post(`/board/api/cards/${w.cards[0].id}/posts`, { data: { tab: "assignment", title: `긴 글 ${i}`, body: "내용\n".repeat(12), attachments: [], groupId: last.id }, headers: origin });
  }
  await request.post("/board/api/admin/logout", { headers: origin });

  await enter(page, w.slug, "칼럼보기", last.name);
  await page.goto(`/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}/c/${w.cards[0].id}?tab=assignment`);
  const board = page.getByTestId("board");
  const column = board.locator(`[data-column="${last.id}"]`);
  await expect(column.getByTestId("post").first()).toBeVisible();
  const box = await column.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeLessThan(viewport.width);
  expect(box!.x + 10).toBeGreaterThanOrEqual(0);

  const header = column.getByTestId("column-header");
  // 카드 상세가 커지는 움직임이 끝나 자리가 멈춘 뒤에 잰다
  let before = -1;
  await expect.poll(async () => {
    const y = (await header.boundingBox())!.y;
    const settled = Math.abs(y - before) < 0.5;
    before = y;
    return settled;
  }).toBe(true);
  await board.evaluate((el) => el.scrollTo({ top: 600 }));
  await expect.poll(async () => board.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(Math.abs((await header.boundingBox())!.y - before)).toBeLessThan(2);
  void isMobile;
});
