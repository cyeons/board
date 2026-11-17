import { type Locator, type Page, expect, test } from "@playwright/test";
import { cardUrl, commentBox, enter, loginPage, newStudent, png1x1, putFromBrowser, seed, tinyPdf } from "./helpers";

const origin = { origin: "http://127.0.0.1:4173" };

async function asTeacher(request: Parameters<typeof seed>[0], fn: () => Promise<unknown>) {
  await request.post("/board/api/admin/login", { data: { password: "board-dev-1234" }, headers: origin });
  await fn();
  await request.post("/board/api/admin/logout", { headers: origin });
}

test("+ 버튼으로 글을 쓰면 카드가 나타나고 다른 사람도 본다", async ({ page, request, browser }) => {
  const w = await seed(request);
  await enter(page, w.slug, "작성자");
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await expect(page.getByRole("button", { name: "게시" })).toBeDisabled();
  await page.getByLabel("제목").fill("첫 글");
  await page.getByLabel("본문").fill("안녕하세요");
  await page.getByRole("button", { name: "게시" }).click();
  await expect(page.locator('[data-post-title="첫 글"]')).toBeVisible();

  const other = await newStudent(browser, w.slug, "구경꾼", "2모둠");
  await other.page.goto(cardUrl(w, w.cards[0].id));
  await expect(other.page.locator('[data-post-title="첫 글"]')).toBeVisible();
  // 다른 모둠 칼럼에는 쓸 수 없다
  await expect(other.page.getByRole("button", { name: "1모둠에 글쓰기" })).toHaveCount(0);
  await other.ctx.close();
});

test("창을 닫아도 글과 첨부가 임시 저장되고 다시 열면 이어 쓴다", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "임시저장");
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.getByLabel("본문").fill("쓰다 만 글");
  await page.getByLabel("이미지 고르기").setInputFiles({ name: "그림.png", mimeType: "image/png", buffer: png1x1 });
  await expect(page.getByText("그림.png")).toBeVisible();
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await expect(page.getByLabel("본문")).toHaveValue("쓰다 만 글");
  await expect(page.getByText("그림.png")).toBeVisible();
});

test("파일을 끌어다 놓거나 붙여넣으면 글쓰기 창이 열린다", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "끌어놓기");
  await page.goto(cardUrl(w, w.cards[0].id));
  await expect(page.getByTestId("board")).toBeVisible();
  const transfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["hello"], "끌어온 파일.txt", { type: "text/plain" }));
    return dt;
  });
  const detail = page.locator("[data-card-detail]");
  await detail.dispatchEvent("dragover", { dataTransfer: transfer });
  await detail.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByText("끌어온 파일.txt")).toBeVisible();
  await page.getByRole("button", { name: "끌어온 파일.txt 빼기" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "게시" })).toHaveCount(0);

  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "붙여넣은 이미지.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  });
  await expect(page.getByText("붙여넣은 이미지.png")).toBeVisible();
});

test("올리는 동안 다른 사람에게 안 보이고, 실패하면 다시 시도한다", async ({ page, request, browser }) => {
  const w = await seed(request);
  await enter(page, w.slug, "업로더");
  const other = await newStudent(browser, w.slug, "다른사람", "2모둠");
  await other.page.goto(cardUrl(w, w.cards[0].id));
  await page.goto(cardUrl(w, w.cards[0].id));

  let blocked = true;
  await page.route("**/dev-files/**", (route) => (blocked && route.request().method() === "PUT" ? route.abort() : route.continue()));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.getByLabel("제목").fill("첨부 글");
  await page.getByLabel("파일 고르기").setInputFiles({ name: "보고서.txt", mimeType: "text/plain", buffer: Buffer.from("내용") });
  await page.getByRole("button", { name: "게시" }).click();

  const pending = page.getByTestId("pending-post");
  await expect(pending).toContainText("첨부 글");
  await expect(pending.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await expect(other.page.locator('[data-post-title="첨부 글"]')).toHaveCount(0);

  blocked = false;
  await pending.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.locator('[data-post-title="첨부 글"]')).toBeVisible();
  await expect(pending).toHaveCount(0);
  await other.page.reload();
  await expect(other.page.locator('[data-post-title="첨부 글"]')).toBeVisible();
  await other.ctx.close();
});

test("용량을 넘는 파일은 고르는 즉시 안내한다", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "큰파일");
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.evaluate(() => {
    const big = new File([new ArrayBuffer(51 * 1024 * 1024)], "큰 파일.zip", { type: "application/zip" });
    const dt = new DataTransfer();
    dt.items.add(big);
    const input = document.querySelector<HTMLInputElement>('input[aria-label="파일 고르기"]')!;
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByRole("alert")).toContainText("50MB까지 올릴 수 있어요");
  await expect(page.getByText("큰 파일.zip")).toHaveCount(0);
});

test("첨부 종류별 미리보기: 이미지, PDF, 파일, YouTube, Google, 일반 링크", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "미리보기");
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.getByLabel("제목").fill("여러 첨부");
  await page.getByLabel("파일 고르기").setInputFiles([
    { name: "사진1.png", mimeType: "image/png", buffer: png1x1 },
    { name: "사진2.png", mimeType: "image/png", buffer: png1x1 },
    { name: "문서.pdf", mimeType: "application/pdf", buffer: tinyPdf },
    { name: "표.csv", mimeType: "text/csv", buffer: Buffer.from("a,b") },
  ]);
  for (const url of ["https://youtu.be/dQw4w9WgXcQ", "https://docs.google.com/presentation/d/abc", "https://docs.google.com/document/d/abc", "https://drive.google.com/file/d/abc", "https://example.com/page"]) {
    await page.getByRole("button", { name: "링크 넣기" }).click();
    await page.getByLabel("링크 주소").fill(url);
    await page.getByRole("button", { name: "넣기", exact: true }).click();
  }
  await page.getByRole("button", { name: "게시" }).click();
  const post = page.locator('[data-post-title="여러 첨부"]');
  await expect(post).toBeVisible({ timeout: 15000 });

  await expect(post.getByText("Google 슬라이드").first()).toBeVisible();
  await expect(post.getByText("Google 문서").first()).toBeVisible();
  await expect(post.getByText("Google 드라이브").first()).toBeVisible();
  await expect(post.getByRole("button", { name: /재생/ })).toBeVisible();
  await expect(post.getByRole("button", { name: "표.csv 내려받기" })).toBeVisible();

  // 이미지 크게 보기, 좌우 넘기기
  await post.getByRole("button", { name: "사진1.png 크게 보기" }).click();
  await expect(page.getByTestId("lightbox-image")).toHaveAttribute("alt", "사진1.png");
  await page.keyboard.press("ArrowRight");
  // 넘기는 동안에는 나가는 사진과 들어오는 사진이 잠깐 함께 있다
  await expect(page.getByTestId("lightbox-image")).toHaveCount(1);
  await expect(page.getByTestId("lightbox-image")).toHaveAttribute("alt", "사진2.png");
  await page.keyboard.press("Escape");

  // PDF 앱 안 뷰어
  await post.getByRole("button", { name: "문서.pdf 보기" }).click();
  await expect(page.getByTestId("pdf-pages").locator("canvas")).toHaveCount(1, { timeout: 15000 });
  await page.keyboard.press("Escape");

  // 게시물 크게 보기와 고유 주소
  await post.getByRole("heading", { name: "여러 첨부" }).click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.getByTestId("post-overlay")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("post-overlay")).toBeVisible();
});

test("글 수정, 삭제, 5초 안에 되살리기, 늦은 제출 표시", async ({ page, request }) => {
  const w = await seed(request);
  await asTeacher(request, () => request.patch(`/board/api/admin/cards/${w.cards[0].id}`, { data: { assignmentDueAt: Date.now() - 1000 }, headers: origin }));
  await enter(page, w.slug, "고치는사람");
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.getByLabel("제목").fill("원래 제목");
  await page.getByRole("button", { name: "게시" }).click();
  const post = page.locator('[data-post-title="원래 제목"]');
  await expect(post).toContainText("늦은 제출");

  await post.getByRole("button", { name: "글 메뉴" }).click();
  await page.getByRole("menuitem", { name: "수정" }).click();
  await page.getByLabel("제목").fill("고친 제목");
  await page.getByRole("button", { name: "게시" }).click();
  const fixed = page.locator('[data-post-title="고친 제목"]');
  await expect(fixed).toBeVisible();

  await fixed.getByRole("button", { name: "글 메뉴" }).click();
  await page.getByRole("menuitem", { name: "삭제" }).click();
  await expect(fixed).toHaveCount(0);
  await page.getByRole("button", { name: "실행 취소" }).click();
  await expect(page.locator('[data-post-title="고친 제목"]')).toBeVisible();
});

test("댓글: 카드 아래에서 바로 작성, 강사 댓글 배경, 최근 2개와 더 보기", async ({ page, request }) => {
  const w = await seed(request);
  await enter(page, w.slug, "댓글쓴이");
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.getByLabel("제목").fill("댓글 받을 글");
  await page.getByRole("button", { name: "게시" }).click();
  const post = page.locator('[data-post-title="댓글 받을 글"]');
  for (const body of ["하나", "둘", "셋"]) {
    await (await commentBox(post)).fill(body);
    await post.getByRole("button", { name: "보내기" }).click();
    await expect(post.getByText(body, { exact: true })).toBeVisible();
    await expect(post.getByLabel("댓글 추가")).toHaveValue("");
  }
  await page.reload();
  const again = page.locator('[data-post-title="댓글 받을 글"]');
  await expect(again.getByTestId("comment")).toHaveCount(2);
  await again.getByRole("button", { name: "댓글 1개 더 보기" }).click();
  await expect(again.getByTestId("comment")).toHaveCount(3);

  const postId = (await (await request.get(`/board/api/cards/${w.cards[0].id}/posts?tab=assignment`)).json()).posts[0].id;
  await asTeacher(request, () => request.post(`/board/api/posts/${postId}/comments`, { data: { body: "강사 댓글" }, headers: origin }));
  await page.reload();
  const comment = page.getByTestId("comment").filter({ hasText: "강사 댓글" });
  await expect(comment).toBeVisible();
  expect(await comment.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(231, 241, 251)");
});

test("좋아요: 두 사람이 눌러도 개수가 맞고 누른 사람 목록이 보이며 취소된다", async ({ page, request, browser }) => {
  const w = await seed(request);
  await enter(page, w.slug, "하나");
  await page.goto(cardUrl(w, w.cards[0].id));
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.getByLabel("제목").fill("하트 글");
  await page.getByRole("button", { name: "게시" }).click();
  const post = page.locator('[data-post-title="하트 글"]');
  const other = await newStudent(browser, w.slug, "둘이", "2모둠");
  await other.page.goto(cardUrl(w, w.cards[0].id));
  const otherPost = other.page.locator('[data-post-title="하트 글"]');
  await Promise.all([post.getByRole("button", { name: "좋아요", exact: true }).click(), otherPost.getByRole("button", { name: "좋아요", exact: true }).click()]);
  await expect(post.getByTestId("like-count")).toHaveText("2");
  await expect(otherPost.getByTestId("like-count")).toHaveText("2");
  await post.getByTestId("like-count").click();
  await expect(page.getByRole("dialog", { name: "좋아요를 누른 사람" })).toContainText("둘이");
  await page.keyboard.press("Escape");
  await post.getByRole("button", { name: "좋아요 취소" }).click();
  await expect(post.getByTestId("like-count")).toHaveText("1");
  await other.ctx.close();
});

test("자료 10개가 zip 하나로 받아진다", async ({ page, request }) => {
  const w = await seed(request);
  await page.goto("/board/");
  await asTeacher(request, async () => {
    for (let i = 0; i < 10; i++) {
      const started = await (await request.post("/board/api/uploads", { data: { courseId: w.course.id, filename: `자료${i}.txt`, mime: "text/plain", size: 5, category: "material" }, headers: origin })).json();
      expect(await putFromBrowser(page, started.uploadUrl, "text/plain", 5)).toBe(200);
      await request.post(`/board/api/uploads/${started.fileId}/complete`, { data: {}, headers: origin });
      await request.post(`/board/api/cards/${w.cards[0].id}/posts`, { data: { tab: "material", title: `자료 ${i}`, body: "", attachments: [{ fileId: started.fileId }] }, headers: origin });
    }
  });
  await enter(page, w.slug, "내려받기");
  await page.goto(cardUrl(w, w.cards[0].id, "material"));
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 내려받기" }).click();
  const download = await wait;
  expect(download.suggestedFilename()).toBe("첫 활동.zip");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const zip = Buffer.concat(chunks);
  expect(zip.subarray(0, 2).toString()).toBe("PK");
  expect(zip.toString("latin1").split("PK\x01\x02").length - 1).toBe(10);
});

async function dropFile(page: Page, target: Locator, name: string) {
  const transfer = await page.evaluateHandle((n) => {
    const dt = new DataTransfer();
    dt.items.add(new File(["hello"], n, { type: "text/plain" }));
    return dt;
  }, name);
  await target.dispatchEvent("dragenter", { dataTransfer: transfer });
  await target.dispatchEvent("dragover", { dataTransfer: transfer });
  await target.dispatchEvent("drop", { dataTransfer: transfer });
}

test("열린 글쓰기 창과 공지 편집 창에도 파일을 끌어다 놓을 수 있다", async ({ page, request, browser, isMobile }) => {
  const w = await seed(request);

  // 수강생: 열린 글쓰기 창에 놓으면 첨부가 하나 더 붙고, 창이 새로 열리지 않는다
  const student = await newStudent(browser, w.slug, "놓기");
  await student.page.goto(cardUrl(w, w.cards[0].id));
  await expect(student.page.getByTestId("board")).toBeVisible();
  await dropFile(student.page, student.page.locator("[data-card-detail]"), "첫 파일.txt");
  const composer = student.page.getByRole("dialog", { name: "글쓰기" });
  await expect(composer.getByText("첫 파일.txt")).toBeVisible();
  await dropFile(student.page, composer, "둘째 파일.txt");
  await expect(composer.getByText("둘째 파일.txt")).toBeVisible();
  await expect(composer.getByText("첫 파일.txt")).toBeVisible();
  await expect(student.page.getByRole("dialog", { name: "글쓰기" })).toHaveCount(1);
  await student.ctx.close();

  // 강사: 공지 편집 창에 놓으면 올라가서 첨부 목록에 뜬다 (편집 도구는 컴퓨터에만 있다, plan.md 6.1)
  if (isMobile) return;
  await loginPage(page);
  await page.goto(`/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}`);
  await page.getByLabel("편집", { exact: true }).click();
  await page.getByRole("button", { name: "공지 쓰기" }).click();
  const notice = page.getByRole("dialog", { name: "공지 편집" });
  await dropFile(page, notice, "공지 자료.txt");
  await expect(notice.getByText("공지 자료.txt")).toBeVisible();
});
