import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import type { PostDto } from "../../lib/cache";
import { fileUrl } from "../../lib/files";
import { loadPdf } from "../../lib/image";

type Attachment = PostDto["attachments"][number];

/** pdf.js로 캔버스에 그린다. CSP가 프레임을 YouTube로만 열어 두었다 (plan.md 14.4). */
export default function PdfViewer({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pages, setPages] = useState({ done: 0, total: 0 });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const url = await fileUrl(attachment.fileId!, "inline");
        if (!url) throw new Error("no url");
        const data = await (await fetch(url)).arrayBuffer();
        const pdf = await loadPdf(data);
        for (let n = 1; n <= pdf.numPages && alive; n++) {
          const page = await pdf.getPage(n);
          const width = holder.current?.clientWidth ?? 600;
          const base = page.getViewport({ scale: 1 });
          const ratio = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.className = "mb-2 border border-line";
          canvas.setAttribute("aria-label", `${n}쪽`);
          holder.current?.append(canvas);
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (!alive) break;
          setPages({ done: n, total: pdf.numPages });
          if (n === 1) setState("ready");
        }
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [attachment.fileId]);

  const download = () => void fileUrl(attachment.fileId!, "download").then((u) => u && (location.href = u));

  return (
    <Modal
      open
      wide
      onOpenChange={(v) => !v && onClose()}
      title={attachment.file?.filename ?? "PDF"}
      actions={
        <button className="icon-btn" aria-label="내려받기" onClick={download}>
          <Download size={20} strokeWidth={1.75} />
        </button>
      }
    >
      {state === "loading" && <p className="text-muted">PDF를 여는 중이에요.</p>}
      {state === "ready" && pages.done < pages.total && (
        <p className="sticky top-0 z-10 mb-2 rounded-full bg-fill-strong px-3 py-1 text-center text-sm text-muted" aria-live="polite">
          {pages.total}쪽 중 {pages.done}쪽까지 불러왔어요
        </p>
      )}
      {state === "error" && <p role="alert">PDF를 열지 못했어요. 내려받아서 확인해 주세요.</p>}
      <div ref={holder} data-testid="pdf-pages" />
    </Modal>
  );
}
