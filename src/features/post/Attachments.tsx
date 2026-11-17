import { Download, File, FileSpreadsheet, FileText, HardDrive, Presentation } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { fileUrl, useFileUrl } from "../../lib/files";
import { formatBytes } from "../../lib/format";
import type { PostDto } from "../../lib/cache";
import { youtubeId } from "../../../worker/lib/links";
import { toast } from "../../lib/toast";

const Lightbox = lazy(() => import("./Lightbox"));
const PdfViewer = lazy(() => import("./PdfViewer"));

type Attachment = PostDto["attachments"][number];

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

async function downloadFile(fileId: string) {
  const url = await fileUrl(fileId, "download");
  if (!url) return toast("파일을 받을 수 없어요. 새로고침한 뒤 다시 시도해 주세요.", { tone: "error" });
  const a = document.createElement("a");
  a.href = url;
  document.body.append(a);
  a.click();
  a.remove();
}

function ImageThumb({ attachment, onOpen, single }: { attachment: Attachment; onOpen: () => void; single: boolean }) {
  const url = useFileUrl(attachment.fileId, "thumb");
  const { width, height, filename } = attachment.file ?? {};
  return (
    <button
      className="block w-full overflow-hidden rounded-control bg-accent-soft"
      style={{ aspectRatio: single && width && height ? `${width} / ${height}` : "1 / 1", maxHeight: single ? 420 : undefined }}
      aria-label={`${filename ?? "사진"} 크게 보기`}
      onClick={(e) => {
        stop(e);
        onOpen();
      }}
    >
      {url && <img src={url} alt={filename ?? ""} loading="lazy" decoding="async" className="h-full w-full object-cover" />}
    </button>
  );
}

function VideoPlayer({ attachment }: { attachment: Attachment }) {
  const url = useFileUrl(attachment.fileId, "inline");
  return <video controls preload="metadata" playsInline className="w-full rounded-control bg-black" src={url ?? undefined} aria-label={attachment.file?.filename ?? "동영상"} onClick={stop} />;
}

function PdfCard({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const thumb = useFileUrl(attachment.file?.hasThumb ? attachment.fileId : null, "thumb");
  return (
    <button
      className="flex w-full items-center gap-3 press rounded-control bg-fill p-2 text-left hover:bg-fill-strong"
      aria-label={`${attachment.file?.filename ?? "PDF"} 보기`}
      onClick={(e) => {
        stop(e);
        onOpen();
      }}
    >
      <span className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface">
        {thumb ? <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" /> : <FileText size={24} strokeWidth={1.75} className="text-accent-ink" aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{attachment.file?.filename}</span>
        <span className="text-sm text-muted">PDF, {formatBytes(attachment.file?.size ?? 0)}</span>
      </span>
    </button>
  );
}

function YouTube({ attachment }: { attachment: Attachment }) {
  const id = youtubeId(attachment.url ?? "");
  const [playing, setPlaying] = useState(false);
  if (!id) return null;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-control bg-black" onClick={stop}>
      {playing ? (
        <iframe
          title={attachment.linkTitle ?? "YouTube 영상"}
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1`}
          className="h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button className="relative block h-full w-full" aria-label={`${attachment.linkTitle ?? "YouTube 영상"} 재생`} onClick={() => setPlaying(true)}>
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
          <span aria-hidden className="absolute top-1/2 left-1/2 flex h-12 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-control bg-[#c00] text-white">
            ▶
          </span>
        </button>
      )}
    </div>
  );
}

const GOOGLE = {
  google_docs: { icon: FileSpreadsheet, label: "Google 문서" },
  google_slides: { icon: Presentation, label: "Google 슬라이드" },
  google_drive: { icon: HardDrive, label: "Google 드라이브" },
} as const;

function LinkCard({ attachment }: { attachment: Attachment }) {
  const provider = attachment.linkProvider ?? "generic";
  const google = provider in GOOGLE ? GOOGLE[provider as keyof typeof GOOGLE] : null;
  const Icon = google?.icon;
  return (
    <a href={attachment.url ?? "#"} target="_blank" rel="noopener noreferrer nofollow" onClick={stop} className="flex items-center gap-3 press overflow-hidden rounded-control bg-fill p-3 hover:bg-fill-strong">
      {google && Icon ? (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface text-accent-ink">
          <Icon size={22} strokeWidth={1.75} aria-hidden />
        </span>
      ) : attachment.linkImage ? (
        <img src={attachment.linkImage} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-16 shrink-0 rounded-lg object-cover" />
      ) : null}
      <span className="min-w-0">
        <span className="block truncate font-medium">{attachment.linkTitle || google?.label || attachment.linkSite || attachment.url}</span>
        {attachment.linkDescription && <span className="line-clamp-2 block text-sm text-muted">{attachment.linkDescription}</span>}
        <span className="block truncate text-sm text-muted">{google?.label ?? attachment.linkSite}</span>
      </span>
    </a>
  );
}

function FileRow({ attachment }: { attachment: Attachment }) {
  return (
    <div className="flex items-center gap-3 rounded-control bg-fill p-2 pl-3.5" onClick={stop}>
      <File size={22} strokeWidth={1.75} className="shrink-0 text-accent-ink" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{attachment.file?.filename}</span>
        <span className="text-sm text-muted">{formatBytes(attachment.file?.size ?? 0)}</span>
      </span>
      <button className="icon-btn" aria-label={`${attachment.file?.filename} 내려받기`} onClick={() => attachment.fileId && void downloadFile(attachment.fileId)}>
        <Download size={20} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function Attachments({ post }: { post: PostDto }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [pdf, setPdf] = useState<Attachment | null>(null);
  const images = post.attachments.filter((a) => a.kind === "image" && a.fileId);
  const others = post.attachments.filter((a) => a.kind !== "image");
  if (!post.attachments.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {images.length > 0 && (
        <div className={images.length === 1 ? "" : "grid grid-cols-2 gap-2"}>
          {images.map((a, i) => (
            <ImageThumb key={a.id} attachment={a} single={images.length === 1} onOpen={() => setLightbox(i)} />
          ))}
        </div>
      )}
      {others.map((a) => {
        if (a.kind === "video") return <VideoPlayer key={a.id} attachment={a} />;
        if (a.kind === "pdf") return <PdfCard key={a.id} attachment={a} onOpen={() => setPdf(a)} />;
        if (a.kind === "link") return a.linkProvider === "youtube" ? <YouTube key={a.id} attachment={a} /> : <LinkCard key={a.id} attachment={a} />;
        return <FileRow key={a.id} attachment={a} />;
      })}
      <Suspense fallback={null}>
        {lightbox !== null && <Lightbox images={images} start={lightbox} onClose={() => setLightbox(null)} />}
        {pdf && <PdfViewer attachment={pdf} onClose={() => setPdf(null)} />}
      </Suspense>
    </div>
  );
}
