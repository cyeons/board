import { useQueryClient } from "@tanstack/react-query";
import { Camera, File as FileIcon, Image as ImageIcon, Link2, Paperclip, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { api, unwrap } from "../../lib/api";
import type { PostDto } from "../../lib/cache";
import { canUseWebcam, isMobileDevice } from "../../lib/device";
import { formatBytes } from "../../lib/format";
import { objectUrl } from "../../lib/image";
import { maxBytes, tooLargeMessage } from "../../lib/upload";
import { useCourse } from "../entry/course";
import { firstUrl } from "../post/Linkified";
import { WebcamDialog } from "./WebcamDialog";
import { clearDraft, loadDraftFiles, loadDraftText, saveDraftFiles, saveDraftText } from "./drafts";
import { type LinkInput, addPending } from "./pending";

const MAX_ATTACHMENTS = 10;

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useMemo(() => (file.type.startsWith("image/") ? objectUrl(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return (
    <li className="flex items-center gap-2 rounded-control bg-fill p-2">
      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <FileIcon size={20} strokeWidth={1.75} className="text-accent-ink" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{file.name}</span>
        <span className="text-sm text-muted">{formatBytes(file.size)}</span>
      </span>
      <button type="button" className="icon-btn" aria-label={`${file.name} 빼기`} onClick={onRemove}>
        <X size={18} strokeWidth={1.75} />
      </button>
    </li>
  );
}

export type ComposerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardId: string;
  lectureId: string;
  tab: "material" | "assignment";
  groupId: string | null;
  editing?: PostDto | null;
  seedFiles?: File[];
  seedText?: string;
  /** 과제 마감. 지났으면 늦은 제출이 된다고 미리 알린다 */
  dueAt?: number | null;
};

export function Composer({ open, onOpenChange, cardId, lectureId, tab, groupId, editing, seedFiles, seedText, dueAt }: ComposerProps) {
  const { course, me, instructor } = useCourse();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<LinkInput[]>([]);
  const [keep, setKeep] = useState<PostDto["attachments"]>([]);
  const [linkInput, setLinkInput] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [webcam, setWebcam] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);
  const category = instructor ? "material" : "student";

  const addFiles = useCallback(
    (incoming: File[]) => {
      setError("");
      const ok: File[] = [];
      for (const f of incoming) {
        if (f.size > maxBytes(category)) setError(tooLargeMessage(category));
        else ok.push(f);
      }
      setFiles((prev) => [...prev, ...ok].slice(0, MAX_ATTACHMENTS));
    },
    [category],
  );

  const addLink = useCallback(async (url: string) => {
    if (!/^https?:\/\//i.test(url)) return setError("링크는 http나 https 주소만 넣을 수 있어요.");
    setError("");
    setLinks((prev) => (prev.some((l) => l.url === url) ? prev : [...prev, { url }]));
    try {
      const preview = await unwrap(api["link-preview"].$post({ json: { url } }));
      setLinks((prev) => prev.map((l) => (l.url === url ? { url, title: preview.title, description: preview.description, image: preview.image, site: preview.site } : l)));
    } catch {
      // 미리보기 없이 링크만 올라간다
    }
  }, []);

  // 창을 열 때 임시 저장을 불러온다. 끌어다 놓은 파일과 붙여넣은 내용을 더한다.
  useEffect(() => {
    if (!open) {
      loaded.current = false;
      return;
    }
    if (loaded.current) return;
    loaded.current = true;
    setError("");
    setLinkInput(null);
    if (editing) {
      setTitle(editing.title);
      setBody(editing.body);
      setFiles([]);
      setLinks([]);
      setKeep(editing.attachments);
      return;
    }
    setKeep([]);
    const draft = loadDraftText(cardId, tab);
    setTitle(draft?.title ?? "");
    setBody(draft?.body ?? "");
    setLinks([]);
    setFiles(seedFiles ?? []);
    void loadDraftFiles(cardId, tab).then((saved) => {
      if (saved.length) setFiles((prev) => [...saved, ...prev].slice(0, MAX_ATTACHMENTS));
    });
    if (seedText) {
      const url = firstUrl(seedText);
      if (url && url === seedText.trim()) void addLink(url);
      else setBody((b) => (b ? `${b}\n${seedText}` : seedText));
    }
  }, [open, editing, cardId, tab, seedFiles, seedText, addLink]);

  // 쓰는 내용을 임시 저장한다
  useEffect(() => {
    if (open && !editing && loaded.current) saveDraftText(cardId, tab, { title, body });
  }, [open, editing, cardId, tab, title, body]);
  useEffect(() => {
    if (open && !editing && loaded.current) void saveDraftFiles(cardId, tab, files);
  }, [open, editing, cardId, tab, files]);

  // 본문의 링크를 자동으로 인식한다
  useEffect(() => {
    const url = firstUrl(body);
    if (!url || !open) return;
    const t = setTimeout(() => void addLink(url), 500);
    return () => clearTimeout(t);
  }, [body, open, addLink]);

  const total = files.length + links.length + keep.length;
  const late = tab === "assignment" && !instructor && !editing && Boolean(dueAt && Date.now() > dueAt);
  const onSubmitKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      publish();
    }
  };
  const canPost = Boolean(title.trim() || body.trim() || total > 0);

  function publish() {
    if (!canPost) return;
    addPending(qc, {
      cardId,
      lectureId,
      courseId: course.id,
      tab,
      groupId,
      title: title.trim(),
      body,
      files: files.map((file) => ({ file, progress: 0 })),
      links,
      keep: keep.map((a) => (a.fileId ? { fileId: a.fileId } : { url: a.url!, title: a.linkTitle, description: a.linkDescription, image: a.linkImage, site: a.linkSite })),
      editId: editing?.id,
      authorName: instructor ? course.instructorName : (me?.nickname ?? ""),
      avatarColor: me?.avatarColor ?? 0,
      isInstructor: instructor,
    });
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      onFiles={addFiles}
      title={editing ? "글 고치기" : tab === "material" ? "자료 쓰기" : "글쓰기"}
      actions={
        <button className="btn btn-primary" disabled={!canPost} onClick={publish}>
          게시
        </button>
      }
    >
      <div className="space-y-3">
        {late && <p className="rounded-control bg-danger-soft p-3 text-sm font-medium text-danger">마감이 지났어요. 올리면 늦은 제출로 표시돼요.</p>}
        <input onKeyDown={onSubmitKey} className="field border-transparent bg-transparent px-0 text-lg font-bold hover:bg-transparent focus:border-transparent focus:bg-transparent" placeholder="제목 (선택)" aria-label="제목" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          className="field min-h-36 border-transparent bg-transparent px-0 hover:bg-transparent focus:border-transparent focus:bg-transparent"
          placeholder="내용을 적어 주세요"
          aria-label="본문"
          maxLength={5000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onSubmitKey}
          onPaste={(e) => {
            const pasted = [...e.clipboardData.files];
            if (pasted.length) {
              e.preventDefault();
              addFiles(pasted);
            }
          }}
        />

        {body.length > 4500 && (
          <p className={`text-right text-sm ${body.length >= 5000 ? "text-danger" : "text-muted"}`} aria-live="polite">
            {body.length}/5000자
          </p>
        )}

        {(keep.length > 0 || files.length > 0 || links.length > 0) && (
          <ul className="space-y-2" aria-label="첨부 목록">
            {keep.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-control bg-fill p-2 pl-3.5">
                <span className="min-w-0 flex-1 truncate">{a.file?.filename ?? a.linkTitle ?? a.url}</span>
                <button type="button" className="icon-btn" aria-label={`${a.file?.filename ?? a.url} 빼기`} onClick={() => setKeep((prev) => prev.filter((x) => x.id !== a.id))}>
                  <X size={18} strokeWidth={1.75} />
                </button>
              </li>
            ))}
            {files.map((f, i) => (
              <FilePreview key={`${f.name}-${i}`} file={f} onRemove={() => setFiles((prev) => prev.filter((_, n) => n !== i))} />
            ))}
            {links.map((l) => (
              <li key={l.url} className="flex items-center gap-2 rounded-control bg-fill p-2 pl-3.5">
                <Link2 size={18} strokeWidth={1.75} className="shrink-0 text-accent-ink" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{l.title ?? l.url}</span>
                <button type="button" className="icon-btn" aria-label={`${l.url} 빼기`} onClick={() => setLinks((prev) => prev.filter((x) => x.url !== l.url))}>
                  <X size={18} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {linkInput !== null && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (linkInput.trim()) void addLink(linkInput.trim());
              setLinkInput(null);
            }}
          >
            <input className="field min-w-0 flex-1" type="url" placeholder="https://" aria-label="링크 주소" autoFocus value={linkInput} onChange={(e) => setLinkInput(e.target.value)} />
            <button className="btn btn-ghost shrink-0">넣기</button>
          </form>
        )}

        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}

        <div className="-mx-5 flex items-center gap-2 overflow-x-auto px-5 pt-1 [scrollbar-width:none]">
          <input ref={fileInput} type="file" multiple className="sr-only" aria-label="파일 고르기" tabIndex={-1} onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
          <input ref={imageInput} type="file" accept="image/*" multiple className="sr-only" aria-label="이미지 고르기" tabIndex={-1} onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="카메라로 찍기" tabIndex={-1} onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
          <button type="button" className="btn btn-quiet btn-sm shrink-0" aria-label="이미지 올리기" onClick={() => imageInput.current?.click()}>
            <ImageIcon size={18} strokeWidth={2} aria-hidden />
            사진
          </button>
          <button type="button" className="btn btn-quiet btn-sm shrink-0" aria-label="파일 올리기" onClick={() => fileInput.current?.click()}>
            <Paperclip size={18} strokeWidth={2} aria-hidden />
            파일
          </button>
          <button type="button" className="btn btn-quiet btn-sm shrink-0" aria-label="링크 넣기" onClick={() => setLinkInput("")}>
            <Link2 size={18} strokeWidth={2} aria-hidden />
            링크
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm shrink-0"
            aria-label="카메라"
            onClick={() => {
              if (!isMobileDevice() && canUseWebcam()) setWebcam(true);
              else cameraInput.current?.click();
            }}
          >
            <Camera size={18} strokeWidth={2} aria-hidden />
            카메라
          </button>
          {!editing && (title || body || files.length > 0) && (
            <button
              type="button"
              className="ml-auto min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-muted hover:bg-fill"
              onClick={() => {
                clearDraft(cardId, tab);
                setTitle("");
                setBody("");
                setFiles([]);
                setLinks([]);
              }}
            >
              지우기
            </button>
          )}
        </div>
      </div>
      {webcam && <WebcamDialog onClose={() => setWebcam(false)} onShot={(file) => addFiles([file])} />}
    </Modal>
  );
}
