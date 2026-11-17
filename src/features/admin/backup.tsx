import { useState } from "react";
import { api, errorText, unwrap } from "../../lib/api";
import { fileUrl } from "../../lib/files";
import { toast, toastError } from "../../lib/toast";
import { saveBlob, zipFiles } from "../post/zip";

function download(name: string, text: string) {
  saveBlob(new Blob([text], { type: "application/json" }), name);
}

/** 서버의 CPU 제한 때문에 나눠서 받고, 브라우저에서 파일 하나로 조립한다 (plan.md 10.2). */
export async function exportCourse(courseId: string) {
  const tables: Record<string, unknown[]> = {};
  let cursor: string | null = "0:0";
  let course: unknown = null;
  while (cursor) {
    const page: { course: unknown; table: string | null; rows: unknown[]; next: string | null } = await unwrap(api.admin.courses[":id"].export.$get({ param: { id: courseId }, query: { cursor } }));
    course = page.course;
    if (page.table) tables[page.table] = [...(tables[page.table] ?? []), ...page.rows];
    cursor = page.next;
  }
  return { exportedAt: new Date().toISOString(), course, tables };
}

export function BackupButtons({ courseId, title, lectures }: { courseId: string; title: string; lectures: { id: string; title: string; date: string }[] }) {
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");

  async function backupData() {
    setBusy("data");
    try {
      download(`${title} 데이터 백업.json`, JSON.stringify(await exportCourse(courseId), null, 2));
      toast("데이터 백업을 내려받았어요.");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy("");
    }
  }

  async function backupFiles(lectureId: string, lectureTitle: string) {
    setBusy(lectureId);
    try {
      const { files } = await unwrap(api.admin.lectures[":id"].files.$get({ param: { id: lectureId } }));
      if (!files.length) {
        toast("이 강의에는 파일이 없어요.");
        return;
      }
      const unique = [...new Map(files.map((f) => [f.fileId, f])).values()];
      const blob = await zipFiles(
        unique.map((f) => ({ name: f.filename, size: f.size, url: () => fileUrl(f.fileId, "download") })),
        (done, total) => setProgress(`${done}/${total}`),
      );
      saveBlob(blob, `${lectureTitle} 파일.zip`);
    } catch (e) {
      toast(errorText(e), { tone: "error" });
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  return (
    <section className="surface rounded-card p-5">
      <h2 className="mb-3 text-lg font-semibold">백업</h2>
      <button className="btn btn-ghost mb-4" disabled={Boolean(busy)} onClick={() => void backupData()}>
        {busy === "data" ? "만드는 중이에요" : "데이터 백업 내려받기"}
      </button>
      {lectures.length > 0 && <p className="mb-2 font-medium">강의별 파일 백업</p>}
      <ul className="space-y-2">
        {lectures.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              {l.date} {l.title}
            </span>
            <button className="btn btn-ghost" disabled={Boolean(busy)} aria-label={`${l.title} 파일 zip으로 내려받기`} onClick={() => void backupFiles(l.id, l.title)}>
              {busy === l.id ? `묶는 중 ${progress}` : "zip으로 내려받기"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
