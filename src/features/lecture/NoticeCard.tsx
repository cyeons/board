import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { api, errorText, unwrap } from "../../lib/api";
import { type LectureData, type PostDto, keys } from "../../lib/cache";
import { toastError } from "../../lib/toast";
import { uploadFile } from "../../lib/upload";
import { useCourse } from "../entry/course";
import { Attachments } from "../post/Attachments";
import { Linkified } from "../post/Linkified";

export function NoticeCard({ lecture, notice, editing }: { lecture: { id: string }; notice: PostDto | null; editing: boolean }) {
  const { course } = useCourse();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<{ fileId: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.lecture(lecture.id) });

  // 저장을 누르면 창을 닫고 고친 공지를 바로 보여 준다. 실패하면 되돌리고 창을 다시 연다.
  const setNotice = (next: PostDto | null) => qc.setQueryData<LectureData>(keys.lecture(lecture.id), (d) => (d ? { ...d, notice: next } : d));
  const save = useMutation({
    mutationFn: () => unwrap(api.admin.lectures[":id"].notice.$put({ param: { id: lecture.id }, json: { title, body, attachments: files.map((f) => ({ fileId: f.fileId })) } })),
    onMutate: () => {
      if (notice) setNotice({ ...notice, title, body });
      setOpen(false);
    },
    onSuccess: (res) => {
      setNotice(res.notice);
      void refresh();
    },
    onError: (e) => {
      setNotice(notice);
      setError(errorText(e));
      setOpen(true);
    },
  });

  function startEdit() {
    setTitle(notice?.title ?? "");
    setBody(notice?.body ?? "");
    setFiles(notice?.attachments.filter((a) => a.fileId).map((a) => ({ fileId: a.fileId!, name: a.file?.filename ?? "첨부" })) ?? []);
    setError("");
    setOpen(true);
  }

  async function addFiles(list: Iterable<File>) {
    setUploading(true);
    try {
      for (const file of list) {
        const res = await uploadFile(file, { courseId: course.id, category: "material" });
        setFiles((prev) => [...prev, { fileId: res.fileId, name: res.filename }]);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(false);
    }
  }

  if (!notice && !editing) return null;

  return (
    <>
      {notice ? (
        <section aria-label="공지" className="rounded-card bg-accent-soft p-5" data-testid="notice">
          <div className="mb-1.5 flex items-center gap-2">
            <span aria-hidden className="emoji text-xl">
              📣
            </span>
            <h2 className="min-w-0 flex-1 text-md font-bold text-accent-ink">{notice.title || "공지"}</h2>
            {editing && (
              <button className="btn btn-sm bg-surface text-accent-ink" onClick={startEdit}>
                공지 편집
              </button>
            )}
          </div>
          {notice.body && (
            <p className="whitespace-pre-wrap">
              <Linkified text={notice.body} />
            </p>
          )}
          <Attachments post={notice} />
        </section>
      ) : (
        <button className="btn btn-ghost w-full" onClick={startEdit}>
          <Megaphone size={18} strokeWidth={2} />
          공지 쓰기
        </button>
      )}
      <Modal open={open} onOpenChange={setOpen} title="공지 편집" onFiles={uploading ? undefined : (files) => void addFiles(files)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <input className="field" aria-label="공지 제목" placeholder="제목" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="field" aria-label="공지 본문" placeholder="본문" rows={5} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f.fileId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                <button type="button" className="icon-btn" aria-label={`${f.name} 빼기`} onClick={() => setFiles((prev) => prev.filter((x) => x.fileId !== f.fileId))}>
                  <X size={18} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
          <input ref={fileInput} type="file" multiple className="sr-only" aria-label="공지 첨부 파일" onChange={(e) => e.target.files && void addFiles(e.target.files)} />
          <button type="button" className="btn btn-ghost" disabled={uploading} onClick={() => fileInput.current?.click()}>
            <Paperclip size={18} strokeWidth={1.75} />
            {uploading ? "올리는 중이에요" : "파일 첨부"}
          </button>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" disabled={save.isPending || uploading}>
              저장
            </button>
            {notice && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  void unwrap(api.admin.lectures[":id"].notice.$delete({ param: { id: lecture.id } }))
                    .then(async () => {
                      setOpen(false);
                      await refresh();
                    })
                    .catch(toastError);
                }}
              >
                공지 삭제
              </button>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
