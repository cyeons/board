const DAY_MS = 86_400_000;
const R2_BATCH = 200;

export function todayKst(now = Date.now()): string {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 자정(KST): 진행 중인 강의와, 날짜가 지났는데 시작하지 않은 공개 강의를 종료한다. */
export async function autoClose(env: Env, now = Date.now()) {
  const { results } = await env.DB.prepare(
    `UPDATE lectures SET status = 'closed', closed_at = ?1, auto_closed = 1, updated_at = ?1
     WHERE deleted_at IS NULL
       AND (status = 'open' OR (status = 'before' AND published = 1 AND date < ?2))
     RETURNING id`,
  )
    .bind(now, todayKst(now))
    .all<{ id: string }>();
  await Promise.all(
    results.map(({ id }) => env.LECTURE_ROOM.getByName(id).broadcast({ type: "lecture.status", lectureId: id, status: "closed" }, { kind: "all" }).catch(() => {})),
  );
  return results.length;
}

const NOT_REFERENCED = `
  id NOT IN (SELECT file_id FROM attachments WHERE file_id IS NOT NULL)
  AND id NOT IN (SELECT cover_file_id FROM lectures WHERE cover_file_id IS NOT NULL)
  AND id NOT IN (SELECT file_id FROM help_requests WHERE file_id IS NOT NULL)`;

/** 삭제 정리 (plan.md 9.3). SQL은 D1에서 돌므로 CPU를 거의 쓰지 않고, R2 삭제만 개수를 나눈다. */
export async function cleanup(env: Env, now = Date.now()) {
  const cutoff = now - DAY_MS;
  const expired = cutoff - 1;
  const run = (sql: string, ...args: unknown[]) => env.DB.prepare(sql).bind(...args);

  await env.DB.batch([
    // 과정 -> 강의
    run(`UPDATE lectures SET deleted_at = ?1 WHERE deleted_at IS NULL AND course_id IN (SELECT id FROM courses WHERE deleted_at < ?2)`, expired, cutoff),
    run(`DELETE FROM groups WHERE course_id IN (SELECT id FROM courses WHERE deleted_at < ?1)`, cutoff),
    run(`DELETE FROM participants WHERE course_id IN (SELECT id FROM courses WHERE deleted_at < ?1)`, cutoff),
    run(`DELETE FROM course_slugs WHERE course_id IN (SELECT id FROM courses WHERE deleted_at < ?1)`, cutoff),
    run(`DELETE FROM help_requests WHERE course_id IN (SELECT id FROM courses WHERE deleted_at < ?1)`, cutoff),
    run(`DELETE FROM courses WHERE deleted_at < ?1`, cutoff),
    // 강의 -> 카드, 게시물
    run(`UPDATE cards SET deleted_at = ?1 WHERE deleted_at IS NULL AND lecture_id IN (SELECT id FROM lectures WHERE deleted_at < ?2)`, expired, cutoff),
    run(`UPDATE posts SET deleted_at = ?1 WHERE deleted_at IS NULL AND lecture_id IN (SELECT id FROM lectures WHERE deleted_at < ?2)`, expired, cutoff),
    run(`DELETE FROM help_requests WHERE lecture_id IN (SELECT id FROM lectures WHERE deleted_at < ?1)`, cutoff),
    run(`DELETE FROM lectures WHERE deleted_at < ?1`, cutoff),
    // 카드 -> 게시물
    run(`UPDATE posts SET deleted_at = ?1 WHERE deleted_at IS NULL AND card_id IN (SELECT id FROM cards WHERE deleted_at < ?2)`, expired, cutoff),
    run(`DELETE FROM cards WHERE deleted_at < ?1`, cutoff),
    // 게시물 -> 댓글, 좋아요, 첨부
    run(`DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE deleted_at < ?1)`, cutoff),
    run(`DELETE FROM likes WHERE post_id IN (SELECT id FROM posts WHERE deleted_at < ?1)`, cutoff),
    run(`DELETE FROM attachments WHERE post_id IN (SELECT id FROM posts WHERE deleted_at < ?1)`, cutoff),
    run(`DELETE FROM posts WHERE deleted_at < ?1`, cutoff),
    run(`DELETE FROM comments WHERE deleted_at < ?1`, cutoff),
    // 참조가 사라진 파일에 표시. 막 올려서 아직 연결 전인 파일은 하루 여유를 준다.
    run(`UPDATE files SET deleted_at = ?1 WHERE deleted_at IS NULL AND status = 'ready' AND created_at < ?2 AND ${NOT_REFERENCED}`, now, cutoff),
    run(`DELETE FROM login_attempts WHERE updated_at < ?1`, cutoff),
  ]);

  const { results } = await run(
    `SELECT id, r2_key, thumb_r2_key FROM files
     WHERE ((deleted_at IS NOT NULL AND deleted_at < ?1) OR (status = 'pending' AND created_at < ?1)) AND ${NOT_REFERENCED}
     LIMIT ${R2_BATCH}`,
    cutoff,
  ).all<{ id: string; r2_key: string; thumb_r2_key: string | null }>();
  if (results.length) {
    await env.FILES.delete(results.flatMap((f) => (f.thumb_r2_key ? [f.r2_key, f.thumb_r2_key] : [f.r2_key])));
    await env.DB.batch(results.map((f) => run(`DELETE FROM files WHERE id = ?1`, f.id)));
  }
  return results.length;
}
