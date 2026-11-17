import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { PostDto } from "../../lib/cache";
import { fileUrl, useFileUrl } from "../../lib/files";
import { fade, pushSpring } from "../../lib/motion";

type Attachment = PostDto["attachments"][number];

/** 넘기는 방향에 따라 들어오고 나가는 쪽이 바뀐다 */
const slide = {
  enter: (dir: number) => ({ x: dir >= 0 ? "40%" : "-40%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? "-40%" : "40%", opacity: 0 }),
};

export default function Lightbox({ images, start, onClose }: { images: Attachment[]; start: number; onClose: () => void }) {
  const reduced = useReducedMotion();
  const [[index, dir], setPage] = useState<[number, number]>([start, 0]);
  const current = images[index]!;
  const url = useFileUrl(current.fileId, "inline");
  const many = images.length > 1;
  const go = (delta: number) => setPage(([i]) => [(i + delta + images.length) % images.length, delta]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="enter-fade fixed inset-0 z-[55] bg-black/92" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-[55] flex items-center justify-center overflow-hidden outline-none" onClick={(e) => e.stopPropagation()}>
          <Dialog.Title className="sr-only">{current.file?.filename ?? "사진"} 크게 보기</Dialog.Title>
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            {url && (
              <motion.img
                key={index}
                src={url}
                alt={current.file?.filename ?? ""}
                data-testid="lightbox-image"
                className="max-h-full max-w-full touch-pan-y object-contain select-none"
                draggable={false}
                custom={dir}
                variants={reduced ? undefined : slide}
                initial={reduced ? { opacity: 0 } : "enter"}
                animate={reduced ? { opacity: 1 } : "center"}
                exit={reduced ? { opacity: 0 } : "exit"}
                transition={reduced ? fade : pushSpring}
                // 손가락을 따라 옆으로 끌리고, 충분히 끌면 다음 사진으로 넘어간다
                drag={many && !reduced ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -60 || info.velocity.x < -400) go(1);
                  else if (info.offset.x > 60 || info.velocity.x > 400) go(-1);
                }}
              />
            )}
          </AnimatePresence>
          <div className="absolute top-[calc(8px+env(safe-area-inset-top,0px))] right-2 flex gap-1">
            <button
              className="icon-btn text-white hover:bg-white/15 hover:text-white"
              aria-label="내려받기"
              onClick={() => {
                void fileUrl(current.fileId!, "download").then((u) => {
                  if (u) location.href = u;
                });
              }}
            >
              <Download size={22} strokeWidth={2} />
            </button>
            <Dialog.Close className="icon-btn text-white hover:bg-white/15 hover:text-white" aria-label="닫기">
              <X size={24} strokeWidth={2} />
            </Dialog.Close>
          </div>
          {many && (
            <>
              <button className="icon-btn absolute left-2 hidden text-white hover:bg-white/15 hover:text-white sm:inline-flex" aria-label="이전 사진" onClick={() => go(-1)}>
                <ChevronLeft size={28} strokeWidth={2} />
              </button>
              <button className="icon-btn absolute right-2 hidden text-white hover:bg-white/15 hover:text-white sm:inline-flex" aria-label="다음 사진" onClick={() => go(1)}>
                <ChevronRight size={28} strokeWidth={2} />
              </button>
              <p className="absolute bottom-[calc(16px+var(--safe-bottom))] rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white">
                {index + 1} / {images.length}
              </p>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
