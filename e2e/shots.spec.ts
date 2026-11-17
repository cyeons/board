import { expect, test } from "@playwright/test";
import { enter, loginPage, seed } from "./helpers";

// 눈으로 확인할 화면 사진. `SHOTS=1`일 때만 찍는다.
test.skip(!process.env.SHOTS, "화면 사진은 필요할 때만");

test("화면 사진", async ({ page, request }, info) => {
  const origin = { origin: "http://127.0.0.1:4173" };
  const w = await seed(request, {
    cards: [
      { title: "오늘의 자료 확인하기", emoji: "📚" },
      { title: "모둠 활동: 수업 설계안 올리기", emoji: "📝" },
      { title: "마무리 소감", emoji: "💬", hasAssignment: true },
    ],
  });
  await request.post("/board/api/admin/login", { data: { password: "board-dev-1234" }, headers: origin });
  await request.put(`/board/api/admin/lectures/${w.lectureId}/notice`, { data: { title: "오늘 준비물", body: "노트북을 준비해 주세요. 자료는 카드 순서대로 확인해 주세요.", attachments: [] }, headers: origin });
  for (const [i, group] of [w.g1, w.g2, w.g1].entries()) {
    await request.post(`/board/api/cards/${w.cards[1].id}/posts`, {
      data: { tab: "assignment", title: `설계안 ${i + 1}`, body: "수업의 도입 활동을 이렇게 구성했어요.\nhttps://example.com 참고", attachments: [{ url: "https://youtu.be/dQw4w9WgXcQ" }], groupId: group.id },
      headers: origin,
    });
  }
  await request.post(`/board/api/cards/${w.cards[0].id}/posts`, { data: { tab: "material", title: "오늘의 슬라이드", body: "수업 전에 한 번 읽어 주세요.", attachments: [{ url: "https://docs.google.com/presentation/d/abc", title: "연수 슬라이드" }] }, headers: origin });
  await request.post("/board/api/admin/logout", { headers: origin });

  const dir = `test-results/shots/${info.project.name}`;
  await enter(page, w.slug, "홍길동", "2모둠");
  await expect(page.getByTestId("big-lecture")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/1-home.png` });
  await page.getByRole("link", { name: "오늘의 강의 들어가기" }).click();
  await expect(page.getByTestId("card-stream")).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/2-lecture.png` });
  await page.getByRole("button", { name: "모둠 활동: 수업 설계안 올리기 열기" }).click();
  await page.getByRole("tab", { name: "과제" }).click();
  await expect(page.getByTestId("post").first()).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/3-board.png` });
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/4-composer.png` });
});

test("강사 화면 사진", async ({ page, request }, info) => {
  const w = await seed(request);
  const dir = `test-results/shots/${info.project.name}`;
  await page.goto("/board/admin");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/5-login.png` });
  await loginPage(page);
  await page.goto("/board/admin/home");
  await expect(page.getByTestId("usage")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/6-admin-home.png` });
  await page.goto(`/board/admin/c/${encodeURIComponent(w.slug)}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/7-course-admin.png`, fullPage: true });
  await page.goto(`/board/${encodeURIComponent(w.slug)}/l/${w.lectureId}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/8-lecture-instructor.png` });
});
