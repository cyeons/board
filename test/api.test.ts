import { SELF, createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { autoClose, cleanup } from "../worker/cron";
import worker from "../worker/index";
import { isBlockedHost, linkProvider, youtubeId } from "../worker/lib/links";
import { normalizeSlug, slugProblem } from "../worker/lib/slug";
import { shiftDate } from "../worker/routes/admin";
import { PASSWORD, assignment, call, cookieFrom, join, loginAdmin, unique, upload, world } from "./helpers";

const ONE_DAY = 86_400_000;

describe("권한", () => {
  it("수강생은 자료 탭에 쓸 수 없고, 강사는 쓸 수 있다", async () => {
    const w = await world();
    const s = await join(w);
    const denied = await call(`/cards/${w.cardId}/posts`, { token: s.token, body: { tab: "material", title: "x", body: "y", attachments: [] } });
    expect(denied.status).toBe(403);
    const ok = await call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: { tab: "material", title: "자료", body: "내용", attachments: [] } });
    expect(ok.status).toBe(200);
    expect(ok.json.post.author).toMatchObject({ type: "instructor", name: "김강사" });
  });

  it("남의 글은 고칠 수 없다", async () => {
    const w = await world();
    const a = await join(w, "가나");
    const b = await join(w, "다라");
    const post = (await call(`/cards/${w.cardId}/posts`, { token: a.token, body: assignment() })).json.post;
    expect((await call(`/posts/${post.id}`, { method: "PATCH", token: b.token, body: { title: "해킹" } })).status).toBe(403);
    expect((await call(`/posts/${post.id}`, { method: "DELETE", token: b.token })).status).toBe(403);
    expect((await call(`/posts/${post.id}`, { method: "PATCH", token: a.token, body: { title: "수정" } })).json.post.title).toBe("수정");
    expect((await call(`/posts/${post.id}`, { method: "PATCH", cookie: w.admin, body: { title: "강사" } })).status).toBe(200);
  });

  it("남의 댓글은 고칠 수 없고 강사는 지울 수 있다", async () => {
    const w = await world();
    const a = await join(w, "가나");
    const b = await join(w, "다라");
    const post = (await call(`/cards/${w.cardId}/posts`, { token: a.token, body: assignment() })).json.post;
    const comment = (await call(`/posts/${post.id}/comments`, { token: a.token, body: { body: "댓글" } })).json.comment;
    expect((await call(`/comments/${comment.id}`, { method: "PATCH", token: b.token, body: { body: "x" } })).status).toBe(403);
    expect((await call(`/comments/${comment.id}`, { method: "DELETE", cookie: w.admin })).status).toBe(200);
  });

  it("강사만 고정할 수 있다", async () => {
    const w = await world();
    const s = await join(w);
    const post = (await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).json.post;
    expect((await call(`/admin/posts/${post.id}/pin`, { method: "PUT", token: s.token })).status).toBe(403);
    expect((await call(`/admin/posts/${post.id}/pin`, { method: "PUT", cookie: w.admin })).status).toBe(200);
    const after = (await call(`/posts/${post.id}`, { token: s.token })).json.post;
    expect(after.pinnedAt).toBeTypeOf("number");
  });

  it("다른 사이트에서 보낸 강사 쓰기 요청은 막는다", async () => {
    const w = await world();
    const res = await call(`/admin/courses/${w.courseId}/end`, { cookie: w.admin, origin: "https://evil.example", body: {} });
    expect(res.status).toBe(403);
    const none = await call(`/admin/courses/${w.courseId}/end`, { cookie: w.admin, origin: null, body: {} });
    expect(none.status).toBe(403);
  });

  it("수강생은 자기 모둠 칼럼에만 쓰고, 강사는 칼럼을 고른다", async () => {
    const w = await world();
    const s = await join(w, "가나", w.groupA);
    const mine = await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment("x", { groupId: w.groupB }) });
    expect(mine.json.post.groupId).toBe(w.groupA);
    const teacher = await call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: assignment("y", { groupId: w.groupB }) });
    expect(teacher.json.post.groupId).toBe(w.groupB);
  });

  it("모둠을 바꿔도 이전 글은 원래 칼럼에 남고, 닉네임은 이전 글에도 반영된다", async () => {
    const w = await world();
    const s = await join(w, "가나", w.groupA);
    const post = (await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).json.post;
    await call("/me", { method: "PATCH", token: s.token, body: { nickname: "바뀐이름", groupId: w.groupB } });
    const after = (await call(`/posts/${post.id}`, { token: s.token })).json.post;
    expect(after.groupId).toBe(w.groupA);
    expect(after.author.name).toBe("바뀐이름");
  });
});

describe("강의 상태", () => {
  it("시작 전과 종료 후 수강생 쓰기를 거절하고 강사는 허용한다", async () => {
    const w = await world({ open: false });
    const s = await join(w);
    expect((await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).status).toBe(423);
    expect((await call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: assignment() })).status).toBe(200);
    await call(`/admin/lectures/${w.lectureId}/open`, { cookie: w.admin, body: {} });
    const post = (await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).json.post;
    const comment = (await call(`/posts/${post.id}/comments`, { token: s.token, body: { body: "c" } })).json.comment;
    await call(`/admin/lectures/${w.lectureId}/close`, { cookie: w.admin, body: {} });
    expect((await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).status).toBe(423);
    expect((await call(`/posts/${post.id}/comments`, { token: s.token, body: { body: "c" } })).status).toBe(423);
    expect((await call(`/comments/${comment.id}`, { method: "PATCH", token: s.token, body: { body: "z" } })).status).toBe(423);
    expect((await call(`/posts/${post.id}/like`, { method: "PUT", token: s.token })).status).toBe(423);
    expect((await call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: assignment() })).status).toBe(200);
    expect((await call(`/posts/${post.id}`, { token: s.token })).status).toBe(200);
  });

  it("열어 본 강의를 시작 전으로 되돌리면 수강생 쓰기가 다시 막힌다", async () => {
    const w = await world({ open: false });
    const s = await join(w);
    await call(`/admin/lectures/${w.lectureId}/open`, { cookie: w.admin, body: {} });
    expect((await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).status).toBe(200);
    expect((await call(`/admin/lectures/${w.lectureId}/reset`, { token: s.token, body: {} })).status).toBe(403);
    expect((await call(`/admin/lectures/${w.lectureId}/reset`, { cookie: w.admin, body: {} })).json.status).toBe("before");
    expect((await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).status).toBe(423);
  });

  it("과정을 종료하면 진행 중 강의도 읽기 전용이다", async () => {
    const w = await world();
    const s = await join(w);
    await call(`/admin/courses/${w.courseId}/end`, { cookie: w.admin, body: {} });
    expect((await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).status).toBe(423);
    await call(`/admin/courses/${w.courseId}/reopen`, { cookie: w.admin, body: {} });
    expect((await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).status).toBe(200);
  });

  it("일부만 고쳐도 나머지 값이 그대로다", async () => {
    const w = await world();
    await call(`/admin/cards/${w.cardId}`, { method: "PATCH", cookie: w.admin, body: { summary: "요약만" } });
    const card = (await call(`/lectures/${w.lectureId}`, { cookie: w.admin })).json.cards[0];
    expect(card).toMatchObject({ summary: "요약만", visible: true, hasAssignment: true, title: "활동" });
    await call(`/admin/lectures/${w.lectureId}`, { method: "PATCH", cookie: w.admin, body: { title: "새 제목" } });
    const lecture = (await call(`/lectures/${w.lectureId}`, { cookie: w.admin })).json.lecture;
    expect(lecture).toMatchObject({ title: "새 제목", published: true, date: "2026-11-01" });
  });

  it("마감이 지나면 늦은 제출로 표시한다", async () => {
    const w = await world();
    await call(`/admin/cards/${w.cardId}`, { method: "PATCH", cookie: w.admin, body: { assignmentDueAt: Date.now() - 1000 } });
    const s = await join(w);
    expect((await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).json.post.isLate).toBe(true);
  });
});

describe("보기 규칙", () => {
  it("비공개 강의는 보이지 않는다", async () => {
    const w = await world({ open: false, published: false });
    const s = await join(w);
    expect((await call(`/lectures/${w.lectureId}`, { token: s.token })).status).toBe(404);
    const home = (await call(`/courses/${encodeURIComponent(w.slug)}`, { token: s.token })).json;
    expect(home.lectures).toHaveLength(0);
    expect((await call(`/lectures/${w.lectureId}`, { cookie: w.admin })).status).toBe(200);
  });

  it("시작 전 강의는 일정만 보이고 게시물, 파일은 하나씩 조회해도 거절한다", async () => {
    const w = await world({ open: false });
    const s = await join(w);
    const file = await upload({ cookie: w.admin }, { courseId: w.courseId }, { category: "material" });
    const post = (await call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: { tab: "material", title: "자료", body: "", attachments: [{ fileId: file.fileId }] } })).json.post;
    const lecture = (await call(`/lectures/${w.lectureId}`, { token: s.token })).json;
    expect(lecture.locked).toBe(true);
    expect(lecture.cards).toHaveLength(0);
    expect((await call(`/cards/${w.cardId}/posts?tab=material`, { token: s.token })).status).toBe(404);
    expect((await call(`/posts/${post.id}`, { token: s.token })).status).toBe(404);
    expect((await call(`/posts/${post.id}/comments`, { token: s.token })).status).toBe(404);
    expect((await call(`/posts/${post.id}/likes`, { token: s.token })).status).toBe(404);
    const urls = await call("/files/urls", { token: s.token, body: { items: [{ fileId: file.fileId, variant: "download" }] } });
    expect(urls.json.urls).toEqual({});
    await call(`/admin/lectures/${w.lectureId}/open`, { cookie: w.admin, body: {} });
    const open = await call("/files/urls", { token: s.token, body: { items: [{ fileId: file.fileId, variant: "download" }] } });
    expect(Object.keys(open.json.urls)).toHaveLength(1);
  });

  it("숨긴 카드는 수강생에게 보이지 않는다", async () => {
    const w = await world({ cardVisible: false });
    const s = await join(w);
    const post = (await call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: { tab: "material", title: "자료", body: "", attachments: [] } })).json.post;
    expect((await call(`/lectures/${w.lectureId}`, { token: s.token })).json.cards).toHaveLength(0);
    expect((await call(`/lectures/${w.lectureId}`, { cookie: w.admin })).json.cards).toHaveLength(1);
    expect((await call(`/cards/${w.cardId}/posts?tab=material`, { token: s.token })).status).toBe(404);
    expect((await call(`/posts/${post.id}`, { token: s.token })).status).toBe(404);
  });

  it("강사만 보기 카드에서는 다른 수강생 글이 응답에 없다", async () => {
    const w = await world({ visibility: "instructor_only" });
    const a = await join(w, "가나");
    const b = await join(w, "다라");
    const post = (await call(`/cards/${w.cardId}/posts`, { token: a.token, body: assignment("비밀") })).json.post;
    expect((await call(`/cards/${w.cardId}/posts?tab=assignment`, { token: a.token })).json.posts).toHaveLength(1);
    expect((await call(`/cards/${w.cardId}/posts?tab=assignment`, { token: b.token })).json.posts).toHaveLength(0);
    expect((await call(`/cards/${w.cardId}/posts?tab=assignment`)).json.posts).toHaveLength(0);
    expect((await call(`/cards/${w.cardId}/posts?tab=assignment`, { cookie: w.admin })).json.posts).toHaveLength(1);
    expect((await call(`/posts/${post.id}`, { token: b.token })).status).toBe(404);
    expect((await call(`/posts/${post.id}/comments`, { token: b.token })).status).toBe(404);
    expect((await call(`/posts/${post.id}/comments`, { token: b.token, body: { body: "엿보기" } })).status).toBe(404);
  });
});

describe("파일", () => {
  it("용량 경계: 강사 100MB, 수강생 50MB, 스크린샷 10MB", async () => {
    const w = await world();
    const s = await join(w);
    const MB = 1024 * 1024;
    const asStudent = (size: number, category = "student") =>
      call("/uploads", { token: s.token, body: { lectureId: w.lectureId, filename: "a.bin", mime: "application/zip", size, category } });
    const asTeacher = (size: number) => call("/uploads", { cookie: w.admin, body: { courseId: w.courseId, filename: "a.bin", mime: "application/zip", size, category: "material" } });
    expect((await asStudent(50 * MB)).status).toBe(200);
    const over = await asStudent(50 * MB + 1);
    expect(over.status).toBe(413);
    expect(over.json.error.message).toContain("50MB");
    expect((await asStudent(10 * MB, "screenshot")).status).toBe(200);
    expect((await asStudent(10 * MB + 1, "screenshot")).status).toBe(413);
    expect((await asTeacher(100 * MB)).status).toBe(200);
    expect((await asTeacher(100 * MB + 1)).status).toBe(413);
  });

  it("합계가 9GB를 넘으면 거절한다", async () => {
    const w = await world();
    const GB = 1024 ** 3;
    await env.DB.prepare(
      `INSERT INTO files (id, course_id, r2_key, filename, mime, size, category, uploader_type, uploader_id, status, created_at) VALUES (?1, ?2, ?1, 'big', 'application/zip', ?3, 'material', 'instructor', 'instructor', 'ready', 0)`,
    )
      .bind(unique("big"), w.courseId, 9 * GB)
      .run();
    const res = await call("/uploads", { cookie: w.admin, body: { courseId: w.courseId, filename: "a.bin", mime: "application/zip", size: 10, category: "material" } });
    expect(res.status).toBe(507);
    await env.DB.prepare(`DELETE FROM files WHERE filename = 'big'`).run();
  });

  it("신고보다 큰 파일과 형식이 다른 파일은 지운다", async () => {
    const w = await world();
    const s = await join(w);
    const started = await call("/uploads", { token: s.token, body: { lectureId: w.lectureId, filename: "a.png", mime: "image/png", size: 4, category: "student" } });
    await SELF.fetch(started.json.uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array(8) });
    const tooBig = await call(`/uploads/${started.json.fileId}/complete`, { token: s.token, body: {} });
    expect(tooBig.status).toBe(413);
    const row = await env.DB.prepare("SELECT status, r2_key FROM files WHERE id = ?").bind(started.json.fileId).first<{ status: string; r2_key: string }>();
    expect(row!.status).toBe("pending");
    expect(await env.FILES.head(row!.r2_key)).toBeNull();

    // 확인을 마친 파일은 같은 주소로 덮어쓸 수 없다
    const ok = await upload({ token: s.token }, { lectureId: w.lectureId });
    expect(ok.completed!.status).toBe(200);
    const again = await SELF.fetch(ok.started.json.uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array(10_000) });
    expect(again.status).toBe(412);

    // 썸네일도 크기를 확인한다
    const bigThumb = await call("/uploads", { token: s.token, body: { lectureId: w.lectureId, filename: "b.png", mime: "image/png", size: 4, category: "student", thumbSize: 1 } });
    await SELF.fetch(bigThumb.json.uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });
    await SELF.fetch(bigThumb.json.thumbUploadUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: new Uint8Array(2 * 1024 * 1024 + 1) });
    expect((await call(`/uploads/${bigThumb.json.fileId}/complete`, { token: s.token, body: {} })).status).toBe(413);

    const fake = await upload({ token: s.token }, { lectureId: w.lectureId }, { bytes: new Uint8Array([1, 2, 3, 4]) });
    expect(fake.completed!.status).toBe(413);
  });

  it("남이 올린 파일은 내 글에 첨부할 수 없다", async () => {
    const w = await world();
    const a = await join(w, "가나");
    const b = await join(w, "다라");
    const shot = await upload({ token: a.token }, { lectureId: w.lectureId }, { category: "screenshot" });
    const res = await call(`/cards/${w.cardId}/posts`, { token: b.token, body: assignment("x", { attachments: [{ fileId: shot.fileId }] }) });
    expect(res.status).toBe(400);
    const help = await call("/help/screenshot", { token: b.token, body: { lectureId: w.lectureId, fileId: shot.fileId } });
    expect(help.status).toBe(400);
  });

  it("스크린샷은 강사만 받는다", async () => {
    const w = await world();
    const a = await join(w, "가나");
    const b = await join(w, "다라");
    const shot = await upload({ token: a.token }, { lectureId: w.lectureId }, { category: "screenshot" });
    const items = [{ fileId: shot.fileId, variant: "inline" }];
    expect((await call("/files/urls", { token: b.token, body: { items } })).json.urls).toEqual({});
    expect((await call("/files/urls", { token: a.token, body: { items } })).json.urls).toEqual({});
    expect(Object.keys((await call("/files/urls", { cookie: w.admin, body: { items } })).json.urls)).toHaveLength(1);
  });

  it("원래 이름으로 내려받고, 썸네일을 함께 저장한다", async () => {
    const w = await world();
    const s = await join(w);
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]);
    const file = await upload({ token: s.token }, { lectureId: w.lectureId }, { bytes, filename: "내 사진.png", thumb: true });
    await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment("x", { attachments: [{ fileId: file.fileId }] }) });
    const urls = (
      await call("/files/urls", {
        token: s.token,
        body: { items: [{ fileId: file.fileId, variant: "download" }, { fileId: file.fileId, variant: "thumb" }] },
      })
    ).json.urls;
    const down = await SELF.fetch(urls[`${file.fileId}:download`]);
    expect(down.headers.get("content-disposition")).toContain(encodeURIComponent("내 사진.png"));
    expect(new Uint8Array(await down.arrayBuffer())).toEqual(bytes);
    const thumb = await SELF.fetch(urls[`${file.fileId}:thumb`]);
    expect(new Uint8Array(await thumb.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("HTML 파일은 화면 안에서 열지 않는다", async () => {
    const w = await world();
    const file = await upload({ cookie: w.admin }, { courseId: w.courseId }, { category: "material", mime: "text/html", bytes: new Uint8Array([60, 104]), filename: "x.html" });
    await call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: { tab: "material", title: "x", body: "", attachments: [{ fileId: file.fileId }] } });
    const urls = (await call("/files/urls", { cookie: w.admin, body: { items: [{ fileId: file.fileId, variant: "inline" }] } })).json.urls;
    const res = await SELF.fetch(urls[`${file.fileId}:inline`]);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
    await res.arrayBuffer();

    // 형식 이름을 바꿔 써도 SVG는 화면 안에서 열지 않는다
    const svg = await upload({ cookie: w.admin }, { courseId: w.courseId }, { category: "material", mime: "IMAGE/SVG+xml; charset=utf-8", bytes: new Uint8Array([60, 115]), filename: "x.svg" });
    await call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: { tab: "material", title: "y", body: "", attachments: [{ fileId: svg.fileId }] } });
    const svgUrls = (await call("/files/urls", { cookie: w.admin, body: { items: [{ fileId: svg.fileId, variant: "inline" }, { fileId: svg.fileId, variant: "thumb" }] } })).json.urls;
    expect(svgUrls[`${svg.fileId}:thumb`]).toBeUndefined();
    const svgRes = await SELF.fetch(svgUrls[`${svg.fileId}:inline`]);
    expect(svgRes.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(svgRes.headers.get("content-type")).toBe("image/svg+xml");
    await svgRes.arrayBuffer();
  });

  it("로컬 전용 파일 경로는 표식이 없으면 닫혀 있다", async () => {
    const { handleDevFile } = await import("../worker/lib/r2");
    const res = await handleDevFile({ ...env, DEV_FILE_PROXY: "" } as Env, "x", new Request("http://x/"));
    expect(res.status).toBe(404);
  });
});

describe("도배 방지", () => {
  it("게시물은 1분에 5개까지", async () => {
    const w = await world();
    const s = await join(w);
    for (let i = 0; i < 5; i++) expect((await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).status).toBe(200);
    const sixth = await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() });
    expect(sixth.status).toBe(429);
    expect(sixth.json.error.message).toContain("잠시 후");
    expect((await call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: assignment() })).status).toBe(200);
  });

  it("스크린샷은 1분에 3장까지", async () => {
    const w = await world();
    const s = await join(w);
    for (let i = 0; i < 3; i++) {
      const f = await upload({ token: s.token }, { lectureId: w.lectureId }, { category: "screenshot" });
      expect((await call("/help/screenshot", { token: s.token, body: { lectureId: w.lectureId, fileId: f.fileId } })).status).toBe(200);
    }
    const f = await upload({ token: s.token }, { lectureId: w.lectureId }, { category: "screenshot" });
    expect((await call("/help/screenshot", { token: s.token, body: { lectureId: w.lectureId, fileId: f.fileId } })).status).toBe(429);
  });

  it("입장은 IP 하나당 1분에 120번까지", async () => {
    const w = await world();
    const ip = unique("flood-");
    for (let i = 0; i < 120; i++) expect((await call(`/courses/${encodeURIComponent(w.slug)}/join`, { ip, body: { nickname: `사람${i}`, groupId: null } })).status).toBe(200);
    const over = await call(`/courses/${encodeURIComponent(w.slug)}/join`, { ip, body: { nickname: "넘친사람", groupId: null } });
    expect(over.status).toBe(429);
    expect((await call(`/courses/${encodeURIComponent(w.slug)}/join`, { ip: unique("other-"), body: { nickname: "다른곳", groupId: null } })).status).toBe(200);
  }, 60_000);

  it("링크 미리보기는 1분에 20번까지", async () => {
    const w = await world();
    const s = await join(w);
    for (let i = 0; i < 20; i++) expect((await call("/link-preview", { token: s.token, body: { url: "http://127.0.0.1:9/x" } })).status).toBe(200);
    expect((await call("/link-preview", { token: s.token, body: { url: "http://127.0.0.1:9/x" } })).status).toBe(429);
  });

  it("같은 IP에서 30명이 입장할 수 있다", async () => {
    const w = await world();
    const ip = unique("nat-");
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => call(`/courses/${encodeURIComponent(w.slug)}/join`, { ip, body: { nickname: `사람${i}`, groupId: null } })),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
  });
});

describe("과정 이름", () => {
  it("정규화와 금지어", () => {
    expect(normalizeSlug(" 1101 연수 ")).toBe("1101-연수");
    expect(normalizeSlug("ABC")).toBe("abc");
    expect(normalizeSlug("가".normalize("NFD"))).toBe("가");
    for (const bad of ["admin", "api", "ws", "assets", "icons", "board", "보드"]) expect(slugProblem(bad)).toBe("reserved");
    expect(slugProblem("a".repeat(31))).toBe("too_long");
    expect(slugProblem("a_b")).toBe("bad_chars");
    expect(slugProblem("---")).toBe("empty");
    expect(slugProblem("1101연수")).toBeNull();
  });

  it("중복을 막고 대소문자를 구분하지 않으며, 옛 이름은 새 이름으로 넘어간다", async () => {
    const admin = await loginAdmin();
    const base = unique("Course");
    const created = await call("/admin/courses", { cookie: admin, body: { title: base, instructorName: "강사" } });
    expect(created.json.course.slug).toBe(base.toLowerCase());
    expect((await call("/admin/courses", { cookie: admin, body: { title: base.toUpperCase(), instructorName: "강사" } })).status).toBe(409);
    expect((await call(`/admin/slug-check?slug=${base}`, { cookie: admin })).json.available).toBe(false);

    const renamed = unique("renamed");
    await call(`/admin/courses/${created.json.course.id}`, { method: "PATCH", cookie: admin, body: { slug: renamed } });
    const old = await call(`/courses/${base.toLowerCase()}`);
    expect(old.json.redirectTo).toBe(renamed.toLowerCase());
    expect((await call(`/shortlink/${base.toLowerCase()}`)).json.path).toBe(`/board/${renamed.toLowerCase()}`);
    // 옛 이름은 다른 과정이 쓸 수 없다
    expect((await call("/admin/courses", { cookie: admin, body: { title: base, instructorName: "강사" } })).status).toBe(409);
  });

  it("이름과 주소를 따로 정하고, 이름만 바꾸면 주소는 그대로다", async () => {
    const admin = await loginAdmin();
    const slug = unique("ai");
    const created = await call("/admin/courses", { cookie: admin, body: { title: "2026 초등 AI 연수 (1기)", slug, instructorName: "강사" } });
    expect(created.json.course).toMatchObject({ title: "2026 초등 AI 연수 (1기)", slug });
    const id = created.json.course.id;
    expect((await call(`/admin/courses/${id}`, { method: "PATCH", cookie: admin, body: { title: "새 이름 (2기)" } })).json.course).toMatchObject({ title: "새 이름 (2기)", slug });
    // 주소로 쓸 수 없는 글자는 주소 칸의 문제로 알려 준다
    const bad = await call("/admin/courses", { cookie: admin, body: { title: "괄호 (연수)", instructorName: "강사" } });
    expect(bad.status).toBe(400);
    expect(bad.json.error.message).toContain("주소");
    const dup = await call(`/admin/courses/${id}/duplicate`, { cookie: admin, body: { title: "복제 (3기)", slug: `${slug}-3`, firstDate: "2026-12-01" } });
    expect(dup.json.slug).toBe(`${slug}-3`);
  });

  it("바로가기는 한글 이름을 찾고, 없는 이름은 404다", async () => {
    const admin = await loginAdmin();
    const title = unique("연수");
    await call("/admin/courses", { cookie: admin, body: { title, instructorName: "강사" } });
    const hit = await call(`/shortlink/${encodeURIComponent(title)}`);
    expect(hit.status).toBe(200);
    expect(hit.json.path).toBe(`/board/${title}`);
    expect(hit.headers.get("cache-control")).toContain("max-age=60");
    expect((await call(`/shortlink/${encodeURIComponent("없는과정xyz")}`)).status).toBe(404);
  });
});

describe("토큰과 신원", () => {
  it("폐기된 토큰을 거절하고, 응답에 내부 ID가 없다", async () => {
    const w = await world();
    const s = await join(w);
    expect(JSON.stringify(s.me)).not.toContain("token");
    expect(s.me.id).toBeUndefined();
    const post = (await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).json;
    const participantRow = await env.DB.prepare("SELECT id FROM participants WHERE public_id = ?").bind(s.me.publicId).first<{ id: string }>();
    expect(JSON.stringify(post)).not.toContain(participantRow!.id);
    const list = await call(`/cards/${w.cardId}/posts?tab=assignment`, { token: s.token });
    expect(JSON.stringify(list.json)).not.toContain(participantRow!.id);
    await call("/me/leave", { token: s.token, body: {} });
    expect((await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).status).toBe(404);
    expect((await call("/me", { token: s.token })).status).toBe(403);
  });

  it("복구 쿠키로 같은 사람이 돌아오고, 다른 사람으로 입장한 뒤에는 복구되지 않는다", async () => {
    const w = await world();
    const s = await join(w);
    const back = await call(`/courses/${encodeURIComponent(w.slug)}/restore`, { cookie: s.cookie, body: {} });
    expect(back.status).toBe(200);
    expect(back.json.participant.publicId).toBe(s.me.publicId);
    expect(back.json.token).toBe(s.token);
    const left = await call("/me/leave", { token: s.token, body: {} });
    expect(left.headers.getSetCookie().join()).toContain(`board_p_${w.courseId}=;`);
    expect((await call(`/courses/${encodeURIComponent(w.slug)}/restore`, { cookie: s.cookie, body: {} })).status).toBe(404);
  });

  it("쿠키가 다른 과정의 것이면 복구되지 않는다", async () => {
    const w1 = await world();
    const w2 = await world();
    const s = await join(w1);
    const res = await call(`/courses/${encodeURIComponent(w2.slug)}/restore`, { cookie: s.cookie.replace(w1.courseId, w2.courseId), body: {} });
    expect(res.status).toBe(404);
  });

  it("닉네임은 2~12자", async () => {
    const w = await world();
    const bad = await call(`/courses/${encodeURIComponent(w.slug)}/join`, { body: { nickname: "가", groupId: null }, ip: unique("x") });
    expect(bad.status).toBe(400);
    expect(bad.json.error.message).toContain("2자");
  });
});

describe("강사 인증", () => {
  it("한 IP의 실패가 다른 IP의 로그인을 막지 않고, 5번 틀리면 10분 잠긴다", async () => {
    await loginAdmin();
    const ip = unique("attacker-");
    for (let i = 0; i < 4; i++) expect((await call("/admin/login", { ip, body: { password: "wrong-password" } })).status).toBe(401);
    const fifth = await call("/admin/login", { ip, body: { password: "wrong-password" } });
    expect(fifth.status).toBe(401);
    expect(fifth.json.error.message).toContain("10분");
    expect((await call("/admin/login", { ip, body: { password: PASSWORD } })).status).toBe(423);
    expect((await call("/admin/login", { ip: unique("teacher-"), body: { password: PASSWORD } })).status).toBe(200);

    // 10분이 지나면 다시 들어올 수 있다
    await env.DB.prepare("UPDATE login_attempts SET locked_until = ?1 WHERE locked_until > ?1").bind(Date.now() - 1).run();
    expect((await call("/admin/login", { ip, body: { password: PASSWORD } })).status).toBe(200);
  });

  it("교실 공유기 뒤의 다른 기기가 틀려도 강사 기기는 잠기지 않고, 한 IP에서 30번 틀리면 모두 잠긴다", async () => {
    const ip = unique("classroom-");
    for (let i = 0; i < 6; i++) await call("/admin/login", { ip, ua: "student-phone", body: { password: "wrong-password" } });
    expect((await call("/admin/login", { ip, ua: "student-phone", body: { password: PASSWORD } })).status).toBe(423);
    expect((await call("/admin/login", { ip, ua: "teacher-laptop", body: { password: PASSWORD } })).status).toBe(200);

    const busy = unique("rotating-");
    for (let i = 0; i < 30; i++) await call("/admin/login", { ip: busy, ua: `bot-${i}`, body: { password: "wrong-password" } });
    const blocked = await call("/admin/login", { ip: busy, ua: "teacher-laptop", body: { password: PASSWORD } });
    expect(blocked.status).toBe(423);
    expect(blocked.json.error.message).toContain("네트워크");
  });

  it("동시에 몰려온 로그인도 5번까지만 비밀번호를 확인한다", async () => {
    const ip = unique("burst-");
    const results = await Promise.all(Array.from({ length: 12 }, () => call("/admin/login", { ip, body: { password: "wrong-password" } })));
    expect(results.filter((r) => r.status === 401)).toHaveLength(5);
    expect(results.filter((r) => r.status === 423)).toHaveLength(7);
  });

  it("비밀번호를 바꾸면 모든 세션이 풀리고 새 비밀번호로 들어온다", async () => {
    const oldCookie = await loginAdmin();
    const changed = await call("/admin/password", { cookie: oldCookie, body: { current: PASSWORD, next: "new-password-9" } });
    expect(changed.status).toBe(200);
    expect((await call("/admin/me", { cookie: oldCookie })).json.instructor).toBe(false);
    const fresh = cookieFrom(changed.headers, "board_admin");
    expect((await call("/admin/me", { cookie: fresh })).json.instructor).toBe(true);
    expect((await call("/admin/login", { ip: unique("a"), body: { password: PASSWORD } })).status).toBe(401);
    expect((await call("/admin/login", { ip: unique("b"), body: { password: "new-password-9" } })).status).toBe(200);
    // 다른 테스트를 위해 되돌린다
    await env.DB.prepare("DELETE FROM admin_state").run();
  });

  it("강사 전용 API는 수강생과 익명에게 닫혀 있다", async () => {
    const w = await world();
    const s = await join(w);
    expect((await call(`/admin/courses`, { token: s.token })).status).toBe(403);
    expect((await call(`/admin/courses`)).status).toBe(403);
    expect((await call(`/admin/storage`, { token: s.token })).status).toBe(403);
  });
});

describe("제출함", () => {
  it("강의 조회에서 수강생 본인이 과제를 낸 카드만 표시하고, 지우면 사라진다", async () => {
    const w = await world();
    const a = await join(w, "가나");
    const b = await join(w, "다라");
    const post = (await call(`/cards/${w.cardId}/posts`, { token: a.token, body: assignment("냈어요") })).json.post;
    const card = async (token?: string, cookie?: string) => (await call(`/lectures/${w.lectureId}`, { token, cookie })).json.cards.find((c: any) => c.id === w.cardId);
    expect((await card(a.token)).submitted).toBe(true);
    expect((await card(b.token)).submitted).toBe(false);
    expect((await card(undefined, w.admin)).submitted).toBe(false);
    await call(`/posts/${post.id}`, { method: "DELETE", token: a.token });
    expect((await card(a.token)).submitted).toBe(false);
  });
});

describe("좋아요와 댓글", () => {
  it("동시에 눌러도 개수가 맞고, 강사 표시가 붙는다", async () => {
    const w = await world();
    const people = await Promise.all([join(w, "가나"), join(w, "다라"), join(w, "마바")]);
    const post = (await call(`/cards/${w.cardId}/posts`, { token: people[0]!.token, body: assignment() })).json.post;
    await Promise.all(people.map((p) => call(`/posts/${post.id}/like`, { method: "PUT", token: p.token })));
    await call(`/posts/${post.id}/like`, { method: "PUT", token: people[0]!.token });
    const liked = await call(`/posts/${post.id}/like`, { method: "PUT", cookie: w.admin });
    expect(liked.json).toMatchObject({ count: 4, instructorLiked: true });
    const names = (await call(`/posts/${post.id}/likes`, { token: people[1]!.token })).json.likers;
    expect(names).toHaveLength(4);
    expect(names.find((n: any) => n.isInstructor).name).toBe("김강사");
    const off = await call(`/posts/${post.id}/like`, { method: "DELETE", token: people[0]!.token });
    expect(off.json).toMatchObject({ count: 3, liked: false });
  });

  it("최근 댓글 2개, 전체 댓글, 삭제와 되살리기", async () => {
    const w = await world();
    const s = await join(w);
    const post = (await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).json.post;
    const ids: string[] = [];
    for (const body of ["첫째", "둘째", "셋째"]) ids.push((await call(`/posts/${post.id}/comments`, { token: s.token, body: { body } })).json.comment.id);
    const listed = (await call(`/cards/${w.cardId}/posts?tab=assignment`, { token: s.token })).json.posts[0];
    expect(listed.commentCount).toBe(3);
    expect(listed.recentComments.map((c: any) => c.body)).toEqual(["둘째", "셋째"]);
    await call(`/comments/${ids[2]}`, { method: "DELETE", token: s.token });
    expect((await call(`/posts/${post.id}`, { token: s.token })).json.post.commentCount).toBe(2);
    await call(`/comments/${ids[2]}/restore`, { token: s.token, body: {} });
    expect((await call(`/posts/${post.id}/comments`, { token: s.token })).json.comments).toHaveLength(3);
    expect((await call(`/posts/${post.id}`, { token: s.token })).json.post.commentCount).toBe(3);
    expect((await call(`/posts/${post.id}/comments`, { token: s.token, body: { body: "가".repeat(1001) } })).status).toBe(400);
  });

  it("지운 글은 되살릴 수 있고, 시간이 지나면 안 된다", async () => {
    const w = await world();
    const s = await join(w);
    const post = (await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment() })).json.post;
    await call(`/posts/${post.id}`, { method: "DELETE", token: s.token });
    expect((await call(`/posts/${post.id}`, { token: s.token })).status).toBe(404);
    expect((await call(`/posts/${post.id}/restore`, { token: s.token, body: {} })).status).toBe(200);
    await env.DB.prepare("UPDATE posts SET deleted_at = ? WHERE id = ?").bind(Date.now() - 20_000, post.id).run();
    expect((await call(`/posts/${post.id}/restore`, { token: s.token, body: {} })).status).toBe(410);
  });
});

describe("입력 제한과 링크", () => {
  it("제목, 본문, 첨부 개수와 링크 형식을 검사한다", async () => {
    const w = await world();
    const s = await join(w);
    const post = (over: Record<string, unknown>) => call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: assignment("x", over) });
    expect((await post({ title: "가".repeat(101) })).status).toBe(400);
    expect((await post({ body: "가".repeat(5001) })).status).toBe(400);
    expect((await post({ attachments: Array.from({ length: 11 }, () => ({ url: "https://a.com" })) })).status).toBe(400);
    expect((await post({ attachments: [{ url: "javascript:alert(1)" }] })).status).toBe(400);
    expect((await post({ attachments: [{ url: "https://youtu.be/dQw4w9WgXcQ" }] })).json.post.attachments[0].linkProvider).toBe("youtube");
    expect((await call("/link-preview", { token: s.token, body: { url: "ftp://a.com" } })).status).toBe(400);
  });

  it("주소 판별", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://example.com/watch?v=1")).toBeNull();
    expect(linkProvider("https://docs.google.com/presentation/d/1")).toBe("google_slides");
    expect(linkProvider("https://docs.google.com/document/d/1")).toBe("google_docs");
    expect(linkProvider("https://drive.google.com/file/d/1")).toBe("google_drive");
    expect(linkProvider("https://example.com")).toBe("generic");
    for (const h of ["localhost", "127.0.0.1", "10.0.0.1", "192.168.1.1", "172.16.0.1", "169.254.169.254", "intranet", "[::1]"]) expect(isBlockedHost(h)).toBe(true);
    expect(isBlockedHost("example.com")).toBe(false);
    expect(isBlockedHost("8.8.8.8")).toBe(false);
  });

  it("내부 주소의 미리보기를 가져오지 않는다", async () => {
    const w = await world();
    const res = await call("/link-preview", { cookie: w.admin, body: { url: "http://127.0.0.1:9/secret" } });
    expect(res.status).toBe(200);
    expect(res.json.title).toBeNull();
  });
});

describe("복제", () => {
  it("강의 복제: 수강생 글 없이 카드와 자료를 복사하고 파일은 공유한다", async () => {
    const w = await world();
    const s = await join(w);
    const file = await upload({ cookie: w.admin }, { courseId: w.courseId }, { category: "material" });
    await call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: { tab: "material", title: "자료", body: "", attachments: [{ fileId: file.fileId }] } });
    await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment("수강생 글") });
    await call(`/admin/lectures/${w.lectureId}/notice`, { method: "PUT", cookie: w.admin, body: { title: "공지", body: "안내", attachments: [] } });
    const original = (await call(`/lectures/${w.lectureId}`, { cookie: w.admin })).json.lecture;
    await call(`/admin/cards/${w.cardId}`, { method: "PATCH", cookie: w.admin, body: { assignmentDueAt: Date.parse(`${original.date}T08:00:00Z`) } });
    const copy = await call(`/admin/lectures/${w.lectureId}/duplicate`, { cookie: w.admin, body: { date: "2026-12-01", startTime: "10:00" } });
    expect(copy.status).toBe(200);
    const lecture = (await call(`/lectures/${copy.json.id}`, { cookie: w.admin })).json;
    expect(lecture.lecture).toMatchObject({ date: "2026-12-01", status: "before", published: false });
    expect(lecture.notice.title).toBe("공지");
    expect(lecture.cards).toHaveLength(1);
    // 과제 마감도 강의 날짜를 옮긴 만큼 옮겨진다
    expect(lecture.cards[0].assignmentDueAt).toBe(Date.parse("2026-12-01T08:00:00Z"));
    expect(lecture.cards[0].materialCount).toBe(1);
    expect(lecture.cards[0].assignmentCount).toBe(0);
    const posts = (await call(`/cards/${lecture.cards[0].id}/posts?tab=material`, { cookie: w.admin })).json.posts;
    expect(posts[0].attachments[0].fileId).toBe(file.fileId);
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM files WHERE id = ?").bind(file.fileId).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it("과정 복제: 모둠과 강의를 옮기고 날짜 간격을 유지한다", async () => {
    const w = await world();
    const s = await join(w);
    await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment("수강생 글") });
    await call(`/admin/courses/${w.courseId}/lectures`, { cookie: w.admin, body: { date: "2026-11-08", startTime: "09:00", title: "둘째" } });
    const copy = await call(`/admin/courses/${w.courseId}/duplicate`, { cookie: w.admin, body: { title: unique("복제"), firstDate: "2027-01-10" } });
    expect(copy.status).toBe(200);
    const detail = (await call(`/admin/courses/${copy.json.courseId}`, { cookie: w.admin })).json;
    expect(detail.groups).toHaveLength(2);
    expect(detail.lectures.map((l: any) => l.date)).toEqual(["2027-01-10", "2027-01-17"]);
    const people = await env.DB.prepare("SELECT COUNT(*) n FROM participants WHERE course_id = ?").bind(copy.json.courseId).first<{ n: number }>();
    expect(people!.n).toBe(0);
    const firstCards = (await call(`/lectures/${detail.lectures[0].id}`, { cookie: w.admin })).json.cards;
    expect(firstCards[0].assignmentCount).toBe(0);
    expect(shiftDate("2026-03-01", "2026-02-28", "2026-12-31")).toBe("2027-01-01");
  });

  it("카드 순서 변경과 복제, 되살리기", async () => {
    const w = await world();
    const a = w.cardId;
    const b = (await call(`/admin/lectures/${w.lectureId}/cards`, { cookie: w.admin, body: { title: "둘째", visible: true } })).json.card.id;
    await call(`/admin/cards/${b}/move`, { method: "PATCH", cookie: w.admin, body: { before: null, after: a } });
    let order = (await call(`/lectures/${w.lectureId}`, { cookie: w.admin })).json.cards.map((c: any) => c.id);
    expect(order).toEqual([b, a]);
    const dup = (await call(`/admin/cards/${b}/duplicate`, { cookie: w.admin, body: {} })).json.card;
    expect(dup.visible).toBe(false);
    order = (await call(`/lectures/${w.lectureId}`, { cookie: w.admin })).json.cards.map((c: any) => c.id);
    expect(order).toEqual([b, dup.id, a]);
    await call(`/admin/cards/${dup.id}`, { method: "DELETE", cookie: w.admin });
    expect((await call(`/lectures/${w.lectureId}`, { cookie: w.admin })).json.cards).toHaveLength(2);
    await call(`/admin/cards/${dup.id}/restore`, { cookie: w.admin, body: {} });
    expect((await call(`/lectures/${w.lectureId}`, { cookie: w.admin })).json.cards).toHaveLength(3);
    // 화면의 목록이 오래되어 이웃 순서가 뒤바뀌었으면 500이 아니라 409
    const stale = await call(`/admin/cards/${dup.id}/move`, { method: "PATCH", cookie: w.admin, body: { before: a, after: b } });
    expect(stale.status).toBe(409);
  });

  it("공지 첨부는 고른 순서를 지키고 올리기를 마친 내 파일만 붙인다", async () => {
    const w = await world();
    const first = await upload({ cookie: w.admin }, { courseId: w.courseId }, { category: "material", filename: "첫째.png" });
    const second = await upload({ cookie: w.admin }, { courseId: w.courseId }, { category: "material", filename: "둘째.png" });
    const saved = await call(`/admin/lectures/${w.lectureId}/notice`, {
      method: "PUT",
      cookie: w.admin,
      body: { title: "공지", body: "", attachments: [{ fileId: second.fileId }, { fileId: first.fileId }] },
    });
    expect(saved.json.notice.attachments.map((x: any) => x.fileId)).toEqual([second.fileId, first.fileId]);
    const pending = await call("/uploads", { cookie: w.admin, body: { courseId: w.courseId, filename: "x.png", mime: "image/png", size: 4, category: "material" } });
    const bad = await call(`/admin/lectures/${w.lectureId}/notice`, { method: "PUT", cookie: w.admin, body: { title: "공지", body: "", attachments: [{ fileId: pending.json.fileId }] } });
    expect(bad.status).toBe(400);
  });
});

describe("Cron", () => {
  it("자정 자동 종료: 진행 중과 지난 날짜의 시작 안 한 강의를 닫는다", async () => {
    const w = await world();
    const before = (await call(`/admin/courses/${w.courseId}/lectures`, { cookie: w.admin, body: { date: "2020-01-01", startTime: "09:00", title: "지난", published: true } })).json.id;
    const future = (await call(`/admin/courses/${w.courseId}/lectures`, { cookie: w.admin, body: { date: "2099-01-01", startTime: "09:00", title: "미래", published: true } })).json.id;
    await autoClose(env);
    const status = async (id: string) => (await call(`/lectures/${id}`, { cookie: w.admin })).json.lecture;
    expect(await status(w.lectureId)).toMatchObject({ status: "closed", autoClosed: true });
    expect((await status(before)).status).toBe("closed");
    expect((await status(future)).status).toBe("before");
    await call(`/admin/lectures/${w.lectureId}/open`, { cookie: w.admin, body: {} });
    expect((await status(w.lectureId)).status).toBe("open");
  });

  it("삭제 정리: 공유 파일은 마지막 참조가 지워질 때만 R2에서 지운다", async () => {
    const w = await world();
    const file = await upload({ cookie: w.admin }, { courseId: w.courseId }, { category: "material", thumb: true });
    const post = (await call(`/cards/${w.cardId}/posts`, { cookie: w.admin, body: { tab: "material", title: "자료", body: "", attachments: [{ fileId: file.fileId }] } })).json.post;
    const copy = (await call(`/admin/lectures/${w.lectureId}/duplicate`, { cookie: w.admin, body: { date: "2026-12-01", startTime: "10:00" } })).json;
    const row = (await env.DB.prepare("SELECT r2_key, thumb_r2_key FROM files WHERE id = ?").bind(file.fileId).first<{ r2_key: string; thumb_r2_key: string }>())!;

    // 원본 강의를 지워도 복제본이 쓰므로 남는다
    await call(`/admin/lectures/${w.lectureId}`, { method: "DELETE", cookie: w.admin });
    const later = Date.now() + 2 * ONE_DAY;
    await cleanup(env, later);
    expect(await env.DB.prepare("SELECT id FROM posts WHERE id = ?").bind(post.id).first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM lectures WHERE id = ?").bind(w.lectureId).first()).toBeNull();
    expect(await env.FILES.head(row.r2_key)).not.toBeNull();

    // 복제본까지 지우면 정리 두 번 뒤 사라진다
    await call(`/admin/lectures/${copy.id}`, { method: "DELETE", cookie: w.admin });
    await cleanup(env, later);
    await cleanup(env, later + 2 * ONE_DAY);
    expect(await env.DB.prepare("SELECT id FROM files WHERE id = ?").bind(file.fileId).first()).toBeNull();
    expect(await env.FILES.head(row.r2_key)).toBeNull();
    expect(await env.FILES.head(row.thumb_r2_key)).toBeNull();
  });

  it("24시간 지난 pending 파일을 정리한다", async () => {
    const w = await world();
    const s = await join(w);
    const started = await call("/uploads", { token: s.token, body: { lectureId: w.lectureId, filename: "a.zip", mime: "application/zip", size: 4, category: "student" } });
    await cleanup(env);
    expect(await env.DB.prepare("SELECT id FROM files WHERE id = ?").bind(started.json.fileId).first()).not.toBeNull();
    await cleanup(env, Date.now() + 2 * ONE_DAY);
    expect(await env.DB.prepare("SELECT id FROM files WHERE id = ?").bind(started.json.fileId).first()).toBeNull();
  });

  it("scheduled 핸들러는 표현식에 맞는 일을 한다", async () => {
    const w = await world();
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "0 * * * *", scheduledTime: Date.now() }), env, ctx);
    expect((await call(`/lectures/${w.lectureId}`, { cookie: w.admin })).json.lecture.status).toBe("open");
    await worker.scheduled(createScheduledController({ cron: "0 15 * * *", scheduledTime: Date.now() }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect((await call(`/lectures/${w.lectureId}`, { cookie: w.admin })).json.lecture.status).toBe("closed");
  });
});

describe("저장 공간과 백업", () => {
  it("지우면 사용량이 줄고, 스크린샷만 전체 삭제할 수 있다", async () => {
    const w = await world();
    const s = await join(w);
    const shot = await upload({ token: s.token }, { lectureId: w.lectureId }, { category: "screenshot" });
    await call("/help/screenshot", { token: s.token, body: { lectureId: w.lectureId, fileId: shot.fileId } });
    const mat = await upload({ cookie: w.admin }, { courseId: w.courseId }, { category: "material" });
    const before = (await call(`/admin/storage?course=${w.courseId}`, { cookie: w.admin })).json.files;
    expect(before).toHaveLength(2);
    expect((await call("/admin/storage/delete-screenshots", { cookie: w.admin, body: { courseId: w.courseId } })).json.deleted).toBe(1);
    const after = (await call(`/admin/storage?course=${w.courseId}`, { cookie: w.admin })).json.files;
    expect(after.map((f: any) => f.id)).toEqual([mat.fileId]);
    await call("/admin/storage/delete", { cookie: w.admin, body: { fileIds: [mat.fileId] } });
    expect((await call(`/admin/storage?course=${w.courseId}`, { cookie: w.admin })).json.files).toHaveLength(0);
  });

  it("백업에 강의, 카드, 글, 댓글이 들어가고 토큰은 없다", async () => {
    const w = await world();
    const s = await join(w);
    const post = (await call(`/cards/${w.cardId}/posts`, { token: s.token, body: assignment("백업글") })).json.post;
    await call(`/posts/${post.id}/comments`, { token: s.token, body: { body: "백업댓글" } });
    const tables: Record<string, unknown[]> = {};
    let cursor: string | null = "0:0";
    while (cursor) {
      const page: any = (await call(`/admin/courses/${w.courseId}/export?cursor=${cursor}`, { cookie: w.admin })).json;
      if (page.table) tables[page.table] = [...(tables[page.table] ?? []), ...page.rows];
      cursor = page.next;
    }
    expect(tables.lectures).toHaveLength(1);
    expect(tables.cards).toHaveLength(1);
    expect(JSON.stringify(tables.posts)).toContain("백업글");
    expect(JSON.stringify(tables.comments)).toContain("백업댓글");
    expect(JSON.stringify(tables.participants)).not.toContain("token");
  });
});

describe("실시간", () => {
  async function connect(kind: "lecture" | "help", id: string, auth: { token?: string; cookie?: string }) {
    const ticket = (await call("/ws-ticket", { ...auth, body: { kind, id } })).json.ticket;
    const res = await SELF.fetch(`http://example.com/board/ws/${kind}/${id}?ticket=${encodeURIComponent(ticket)}`, {
      headers: { upgrade: "websocket", origin: "http://example.com" },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();
    const seen: any[] = [];
    ws.addEventListener("message", (e) => {
      seen.push(JSON.parse(e.data as string));
    });
    return { ws, seen };
  }
  const settle = () => new Promise((r) => setTimeout(r, 400));
  const types = (seen: any[]) => seen.map((e) => e.type);

  it("티켓이 없거나 다른 출처면 연결을 거절한다", async () => {
    const w = await world();
    const s = await join(w);
    const url = `http://example.com/board/ws/lecture/${w.lectureId}`;
    expect((await SELF.fetch(url, { headers: { upgrade: "websocket", origin: "http://example.com" } })).status).toBe(403);
    expect((await SELF.fetch(`${url}?ticket=가짜`, { headers: { upgrade: "websocket", origin: "http://example.com" } })).status).toBe(403);
    const ticket = (await call("/ws-ticket", { token: s.token, body: { kind: "lecture", id: w.lectureId } })).json.ticket;
    expect((await SELF.fetch(`${url}?ticket=${encodeURIComponent(ticket)}`, { headers: { upgrade: "websocket", origin: "https://evil.example" } })).status).toBe(403);
    const other = (await call("/ws-ticket", { token: s.token, body: { kind: "help", id: w.courseId } })).json.ticket;
    expect((await SELF.fetch(`${url}?ticket=${encodeURIComponent(other)}`, { headers: { upgrade: "websocket", origin: "http://example.com" } })).status).toBe(403);
  });

  it("비공개 강의와 익명에게 티켓을 주지 않는다", async () => {
    const w = await world({ open: false, published: false });
    const s = await join(w);
    expect((await call("/ws-ticket", { token: s.token, body: { kind: "lecture", id: w.lectureId } })).status).toBe(403);
    expect((await call("/ws-ticket", { body: { kind: "lecture", id: w.lectureId } })).status).toBe(403);
    expect((await call("/ws-ticket", { cookie: w.admin, body: { kind: "lecture", id: w.lectureId } })).status).toBe(200);
  });

  it("시작 전 강의의 수강생은 시작 알림만 받고, 시작하면 바로 내용을 받는다", async () => {
    const w = await world({ open: false });
    const s = await join(w);
    const early = await connect("lecture", w.lectureId, { token: s.token });
    // 시작 전에 강사가 준비하는 카드는 새어 나가지 않는다
    await call(`/admin/lectures/${w.lectureId}/cards`, { cookie: w.admin, body: { title: "준비 중", visible: true } });
    await settle();
    expect(types(early.seen)).not.toContain("card.upsert");

    await call(`/admin/lectures/${w.lectureId}/open`, { cookie: w.admin, body: {} });
    await settle();
    expect(early.seen.find((e) => e.type === "lecture.status")).toMatchObject({ status: "open" });
    await call(`/admin/lectures/${w.lectureId}/cards`, { cookie: w.admin, body: { title: "시작 뒤", visible: true } });
    await settle();
    expect(early.seen.find((e) => e.type === "card.upsert")).toMatchObject({ card: { title: "시작 뒤" } });

    // 시작 전으로 되돌리면 다시 기다린다
    await call(`/admin/lectures/${w.lectureId}/reset`, { cookie: w.admin, body: {} });
    await call(`/admin/lectures/${w.lectureId}/cards`, { cookie: w.admin, body: { title: "되돌린 뒤", visible: true } });
    await settle();
    expect(early.seen.filter((e) => e.type === "card.upsert")).toHaveLength(1);
    early.ws.close();
  });

  it("모둠을 바꾸면 접속 중인 수강생에게 알린다", async () => {
    const w = await world();
    const s = await join(w);
    const conn = await connect("lecture", w.lectureId, { token: s.token });
    await call(`/admin/groups/${w.groupB}`, { method: "DELETE", cookie: w.admin });
    await settle();
    expect(types(conn.seen)).toContain("course.update");
    expect((await call("/me", { token: s.token })).json.participant.groupId).toBe(w.groupA);
    conn.ws.close();
  });

  it("글, 댓글, 좋아요, 카드 공개가 방송되고 접속 현황은 강사만 받는다", async () => {
    const w = await world();
    const a = await join(w, "가나");
    const b = await join(w, "다라");
    const teacher = await connect("lecture", w.lectureId, { cookie: w.admin });
    const peer = await connect("lecture", w.lectureId, { token: b.token });
    const self = await connect("lecture", w.lectureId, { token: a.token });
    await settle();
    expect(teacher.seen.filter((e) => e.type === "presence").at(-1)).toMatchObject({ count: 2 });
    expect(types(peer.seen)).not.toContain("presence");

    const post = (await call(`/cards/${w.cardId}/posts`, { token: a.token, body: assignment("실시간") })).json.post;
    await call(`/posts/${post.id}/comments`, { token: b.token, body: { body: "좋아요" } });
    await call(`/posts/${post.id}/like`, { method: "PUT", token: b.token });
    await settle();
    expect(types(peer.seen)).toEqual(expect.arrayContaining(["post.upsert", "comment.upsert", "like.update"]));

    // 자기 글에 좋아요를 누른 사람이 글을 고쳐도, 다른 사람에게 간 글은 "내가 누름"이 아니다
    await call(`/posts/${post.id}/like`, { method: "PUT", token: a.token });
    await call(`/posts/${post.id}`, { method: "PATCH", token: a.token, body: { title: "고침" } });
    await settle();
    expect(peer.seen.filter((e) => e.type === "post.upsert").at(-1).post).toMatchObject({ title: "고침", liked: false });

    const hidden = (await call(`/admin/lectures/${w.lectureId}/cards`, { cookie: w.admin, body: { title: "숨김", visible: false } })).json.card;
    await call(`/cards/${hidden.id}/posts`, { cookie: w.admin, body: { tab: "material", title: "미리 둔 자료", body: "", attachments: [] } });
    await settle();
    expect(peer.seen.filter((e) => e.type === "card.upsert")).toHaveLength(0);
    expect(teacher.seen.filter((e) => e.type === "card.upsert")).toHaveLength(1);
    await call(`/admin/cards/${hidden.id}`, { method: "PATCH", cookie: w.admin, body: { visible: true } });
    await settle();
    // 처음 보는 카드이므로 개수를 함께 받아야 한다
    expect(peer.seen.find((e) => e.type === "card.upsert")).toMatchObject({ revealed: true, card: { materialCount: 1 } });

    // 강사의 댓글과 좋아요는 작성자에게만 개인 알림
    await call(`/posts/${post.id}/comments`, { cookie: w.admin, body: { body: "잘했어요" } });
    await call(`/posts/${post.id}/like`, { method: "PUT", cookie: w.admin });
    await settle();
    expect(self.seen.filter((e) => e.type === "notify").map((e) => e.kind)).toEqual(["instructor_comment", "instructor_like"]);
    expect(types(peer.seen)).not.toContain("notify");

    for (const c of [teacher, peer, self]) c.ws.close();
  });

  it("강사만 보기 글과 그 댓글, 좋아요 이벤트는 다른 수강생에게 가지 않는다", async () => {
    const w = await world({ visibility: "instructor_only" });
    const a = await join(w, "가나");
    const b = await join(w, "다라");
    const peer = await connect("lecture", w.lectureId, { token: b.token });
    const self = await connect("lecture", w.lectureId, { token: a.token });
    const teacher = await connect("lecture", w.lectureId, { cookie: w.admin });
    const post = (await call(`/cards/${w.cardId}/posts`, { token: a.token, body: assignment("비밀") })).json.post;
    await call(`/posts/${post.id}/comments`, { cookie: w.admin, body: { body: "확인" } });
    await call(`/posts/${post.id}/like`, { method: "PUT", cookie: w.admin });
    await settle();
    expect(peer.seen).toHaveLength(0);
    expect(types(self.seen)).toEqual(expect.arrayContaining(["post.upsert", "comment.upsert", "like.update"]));
    expect(types(teacher.seen)).toEqual(expect.arrayContaining(["post.upsert", "comment.upsert", "like.update"]));
    for (const c of [teacher, peer, self]) c.ws.close();
  });

  it("도움 요청은 강사에게만 가고, 화면 공유 신호는 당사자에게만 간다", async () => {
    const w = await world();
    const a = await join(w, "가나");
    const b = await join(w, "다라");
    const teacher = await connect("help", w.courseId, { cookie: w.admin });
    const sa = await connect("help", w.courseId, { token: a.token });
    const sb = await connect("help", w.courseId, { token: b.token });
    const shot = await upload({ token: a.token }, { lectureId: w.lectureId }, { category: "screenshot" });
    await call("/help/screenshot", { token: a.token, body: { lectureId: w.lectureId, fileId: shot.fileId, message: "오류가 나요" } });
    const live = (await call("/help/live", { token: a.token, body: { lectureId: w.lectureId } })).json.request;
    await settle();
    const fresh = teacher.seen.filter((e) => e.type === "help.new");
    expect(fresh[0].request).toMatchObject({ kind: "screenshot", message: "오류가 나요", participant: { nickname: "가나" } });
    expect(sb.seen).toHaveLength(0);

    await call(`/admin/help/${live.id}`, { method: "PATCH", cookie: w.admin, body: { status: "viewing" } });
    await settle();
    expect(sa.seen.find((e) => e.type === "rtc.start")).toMatchObject({ helpId: live.id });
    expect(types(sb.seen)).not.toContain("rtc.start");

    sa.ws.send(JSON.stringify({ type: "rtc.offer", helpId: live.id, data: { sdp: "x" } }));
    await settle();
    expect(teacher.seen.find((e) => e.type === "rtc.offer")).toMatchObject({ from: a.me.publicId, data: { sdp: "x" } });
    expect(types(sb.seen)).not.toContain("rtc.offer");

    teacher.ws.send(JSON.stringify({ type: "rtc.answer", helpId: live.id, to: a.me.publicId, data: { sdp: "y" } }));
    await settle();
    expect(sa.seen.find((e) => e.type === "rtc.answer")).toMatchObject({ data: { sdp: "y" } });
    expect(types(sb.seen)).not.toContain("rtc.answer");

    // 수강생이 강사인 척 다른 수강생에게 보낼 수 없다
    sb.ws.send(JSON.stringify({ type: "rtc.offer", to: a.me.publicId, data: { sdp: "z" } }));
    await settle();
    expect(sa.seen.filter((e) => e.type === "rtc.offer")).toHaveLength(0);

    // 다른 사람을 보면 이전 공유가 끝난다
    const liveB = (await call("/help/live", { token: b.token, body: { lectureId: w.lectureId } })).json.request;
    await call(`/admin/help/${liveB.id}`, { method: "PATCH", cookie: w.admin, body: { status: "viewing" } });
    await settle();
    expect(sa.seen.find((e) => e.type === "rtc.end")).toMatchObject({ helpId: live.id });
    const list = (await call(`/admin/courses/${w.courseId}/help`, { cookie: w.admin })).json.requests;
    expect(list.find((r: any) => r.id === live.id).status).toBe("done");

    // 수강생 연결이 끊기면 대기 중인 실시간 요청이 끝나고 스크린샷은 남는다
    sb.ws.close();
    await settle();
    await settle();
    const after = (await call(`/admin/courses/${w.courseId}/help`, { cookie: w.admin })).json.requests;
    expect(after.find((r: any) => r.id === liveB.id).status).toBe("done");
    expect(after.find((r: any) => r.kind === "screenshot").status).toBe("waiting");
    teacher.ws.close();
    sa.ws.close();
  });

  it("수강생은 다른 과정의 강의 방에 들어갈 수 없다", async () => {
    const w1 = await world();
    const w2 = await world();
    const s = await join(w1);
    expect((await call("/ws-ticket", { token: s.token, body: { kind: "lecture", id: w2.lectureId } })).status).toBe(403);
    expect((await call("/ws-ticket", { token: s.token, body: { kind: "help", id: w2.courseId } })).status).toBe(403);
  });
});

describe("TURN", () => {
  it("입장한 사람에게만 주고, 키가 없으면 STUN만 준다", async () => {
    const w = await world();
    const s = await join(w);
    expect((await call("/turn-credentials")).status).toBe(403);
    const res = await call("/turn-credentials", { token: s.token });
    expect(res.json.iceServers[0].urls).toContain("stun:");
  });
});

describe("성공 기준", () => {
  it("30명이 접속한 강의에서 새 글과 댓글이 1초 안에 모두에게 간다", async () => {
    const w = await world();
    const people = await Promise.all(Array.from({ length: 30 }, (_, i) => join(w, `사람${i}`, null)));
    const sockets = await Promise.all(
      people.map(async (p) => {
        const ticket = (await call("/ws-ticket", { token: p.token, body: { kind: "lecture", id: w.lectureId } })).json.ticket;
        const res = await SELF.fetch(`http://example.com/board/ws/lecture/${w.lectureId}?ticket=${encodeURIComponent(ticket)}`, { headers: { upgrade: "websocket", origin: "http://example.com" } });
        const ws = res.webSocket!;
        ws.accept();
        return ws;
      }),
    );
    const arrive = (type: string) =>
      Promise.all(
        sockets.map(
          (ws) =>
            new Promise<void>((resolve) => {
              const on = (e: MessageEvent) => {
                if (JSON.parse(e.data as string).type === type) {
                  ws.removeEventListener("message", on);
                  resolve();
                }
              };
              ws.addEventListener("message", on);
            }),
        ),
      );
    let started = Date.now();
    let all = arrive("post.upsert");
    const post = (await call(`/cards/${w.cardId}/posts`, { token: people[0]!.token, body: assignment("모두에게") })).json.post;
    await all;
    const postMs = Date.now() - started;
    started = Date.now();
    all = arrive("comment.upsert");
    await call(`/posts/${post.id}/comments`, { token: people[1]!.token, body: { body: "댓글" } });
    await all;
    const commentMs = Date.now() - started;
    console.log(`30명 방송: 글 ${postMs}ms, 댓글 ${commentMs}ms`);
    expect(postMs).toBeLessThan(1000);
    expect(commentMs).toBeLessThan(1000);
    for (const ws of sockets) ws.close();
  });
});
