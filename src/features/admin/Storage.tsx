import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Confirm, Modal } from "../../components/ui/Modal";
import { api, errorText, unwrap } from "../../lib/api";
import { formatBytes, timeAgo } from "../../lib/format";
import { toast, toastError } from "../../lib/toast";
import { AdminFrame } from "./AdminFrame";

const CAPACITY = 10 * 1024 ** 3;
const CATEGORY: Record<string, string> = { material: "강사 자료", cover: "강사 자료", student: "수강생 첨부", screenshot: "스크린샷" };
const FILTERS = ["전체", "강사 자료", "수강생 첨부", "스크린샷"] as const;

export default function Storage() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["admin", "storage"], queryFn: () => unwrap(api.admin.storage.$get({ query: {} })) });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("전체");
  const [lectureFilter, setLectureFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmShots, setConfirmShots] = useState(false);
  const [confirmFiles, setConfirmFiles] = useState(false);

  const refresh = async () => {
    setSelected(new Set());
    await qc.invalidateQueries({ queryKey: ["admin"] });
  };
  const remove = useMutation({
    mutationFn: () => unwrap(api.admin.storage.delete.$post({ json: { fileIds: [...selected] } })),
    onSuccess: async () => {
      setConfirmFiles(false);
      toast("파일을 지웠어요. 복제한 강의에서 함께 쓰던 첨부도 함께 빠졌어요.");
      await refresh();
    },
    onError: toastError,
  });
  const removeShots = useMutation({
    mutationFn: () => unwrap(api.admin.storage["delete-screenshots"].$post({ json: {} })),
    onSuccess: async (res) => {
      setConfirmShots(false);
      toast(`스크린샷 ${res.deleted}장을 지웠어요.`);
      await refresh();
    },
    onError: toastError,
  });

  const files = data.data?.files ?? [];
  const lectures = data.data?.lectures ?? [];
  const used = files.reduce((sum, f) => sum + f.total, 0);
  const byCategory = FILTERS.slice(1).map((name) => ({ name, bytes: files.filter((f) => CATEGORY[f.category] === name).reduce((s, f) => s + f.total, 0) }));
  const byLecture = lectures
    .map((l) => ({ ...l, bytes: files.filter((f) => f.lectureIds.includes(l.id)).reduce((s, f) => s + f.total, 0) }))
    .filter((l) => l.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);
  const shown = files.filter((f) => (filter === "전체" || CATEGORY[f.category] === filter) && (!lectureFilter || f.lectureIds.includes(lectureFilter)));
  const allShown = shown.length > 0 && shown.every((f) => selected.has(f.id));

  return (
    <AdminFrame title="저장 공간" back={{ to: "/admin/home", label: "과정 목록" }}>
      {data.isError && <p className="text-danger">{errorText(data.error)}</p>}
      <section className="surface mb-6 rounded-card p-5">
        <div className="mb-2 flex justify-between">
          <span className="font-semibold">전체 사용량</span>
          <span className="text-muted" data-testid="storage-used">
            {formatBytes(used)} 사용, 10GB 중
          </span>
        </div>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-accent-soft">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (used / CAPACITY) * 100)}%` }} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="mb-1 font-semibold">종류별</h2>
            <ul>
              {byCategory.map((c) => (
                <li key={c.name} className="flex justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="text-muted">{formatBytes(c.bytes)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-1 font-semibold">강의별</h2>
            {byLecture.length === 0 && <p className="text-sm text-muted">아직 파일이 없어요.</p>}
            <ul>
              {byLecture.slice(0, 8).map((l) => (
                <li key={l.id} className="flex justify-between gap-2 text-sm">
                  <span className="truncate">
                    {l.date} {l.title}
                  </span>
                  <span className="shrink-0 text-muted">{formatBytes(l.bytes)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="field w-auto" aria-label="종류로 거르기" value={filter} onChange={(e) => setFilter(e.target.value as (typeof FILTERS)[number])}>
          {FILTERS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <select className="field w-auto max-w-60" aria-label="강의로 거르기" value={lectureFilter} onChange={(e) => setLectureFilter(e.target.value)}>
          <option value="">모든 강의</option>
          {lectures.map((l) => (
            <option key={l.id} value={l.id}>
              {l.date} {l.title}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button className="btn btn-ghost" onClick={() => setConfirmShots(true)}>
          스크린샷만 전체 삭제
        </button>
        <button className="btn btn-danger" disabled={!selected.size || remove.isPending} onClick={() => setConfirmFiles(true)}>
          고른 파일 {selected.size}개 삭제
        </button>
      </div>

      <section className="surface rounded-card p-3">
        {shown.length === 0 && <p className="py-8 text-center text-muted">이 조건의 파일이 없어요.</p>}
        {shown.length > 0 && (
          <label className="flex min-h-11 items-center gap-3 border-b border-line px-2 font-medium">
            <input
              type="checkbox"
              className="size-5"
              checked={allShown}
              onChange={() => setSelected(allShown ? new Set() : new Set(shown.map((f) => f.id)))}
            />
            모두 고르기
          </label>
        )}
        <ul>
          {shown.map((f) => (
            <li key={f.id}>
              <label className="flex min-h-11 items-center gap-3 px-2 py-1">
                <input
                  type="checkbox"
                  className="size-5 shrink-0"
                  checked={selected.has(f.id)}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(f.id)) next.delete(f.id);
                    else next.add(f.id);
                    setSelected(next);
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                <span className="shrink-0 text-sm text-muted">{CATEGORY[f.category]}</span>
                <span className="w-16 shrink-0 text-right text-sm text-muted">{formatBytes(f.total)}</span>
                <span className="hidden w-28 shrink-0 text-right text-sm text-muted sm:block">{timeAgo(f.createdAt)}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <Confirm open={confirmFiles} onOpenChange={setConfirmFiles} title="파일 삭제" confirmLabel={`${selected.size}개 지우기`} busy={remove.isPending} onConfirm={() => remove.mutate()}>
        <p>고른 파일 {selected.size}개를 지울까요? 이 파일을 붙인 글에서도 첨부가 빠지고, 되돌릴 수 없어요.</p>
      </Confirm>
      <Modal open={confirmShots} onOpenChange={setConfirmShots} title="스크린샷 전체 삭제">
        <p className="mb-4">모든 과정의 스크린샷을 지울까요? 되돌릴 수 없어요.</p>
        <button className="btn btn-danger w-full" disabled={removeShots.isPending} onClick={() => removeShots.mutate()}>
          스크린샷 모두 지우기
        </button>
      </Modal>
    </AdminFrame>
  );
}
