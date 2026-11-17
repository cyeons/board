import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import type { PointerEvent, ReactNode } from "react";
import { useKeyboardInset, useWide } from "../../lib/device";
import { useFileDrop } from "../../lib/drop";
import { fade, sheetSpring } from "../../lib/motion";

/** 되돌릴 수 없는 일을 하기 전에 묻는 창. 취소가 먼저, 위험한 버튼이 나중이다 */
export function Confirm({ open, onOpenChange, title, children, confirmLabel, onConfirm, busy }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; busy?: boolean }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title}>
      <div className="space-y-4">
        {children}
        <div className="flex gap-2">
          <button className="btn btn-quiet flex-1" onClick={() => onOpenChange(false)}>
            취소
          </button>
          <button className="btn btn-danger flex-1" aria-busy={busy} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** 끌어내려 닫는 거리와 속도. 카드 상세(CardDetail)와 같은 기준이다. */
const CLOSE_OFFSET = 120;
const CLOSE_VELOCITY = 600;

/**
 * 휴대폰에서는 아래에서 올라오는 시트(손잡이를 끌어내려 닫기), 컴퓨터에서는 가운데 창.
 * 열고 닫을 때 모두 움직인다. Radix Dialog가 포커스 가두기와 Esc 닫기를 맡는다.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  children,
  wide,
  actions,
  onFiles,
  bare,
  onExitComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  actions?: ReactNode;
  /** 주면 창 어디에 파일을 끌어다 놓아도 받는다 */
  onFiles?: (files: File[]) => void;
  /** 제목 줄 없이 손잡이와 내용만 (메뉴 시트). 제목은 화면 읽기 프로그램에만 알린다. */
  bare?: boolean;
  /** 닫히는 움직임이 끝난 뒤 */
  onExitComplete?: () => void;
}) {
  const desktop = useWide();
  const reduced = useReducedMotion();
  const drag = useDragControls();
  const { dragging, dropProps } = useFileDrop(onFiles);
  const sheet = !desktop;
  const keyboard = useKeyboardInset(open && sheet);

  const startDrag = (e: PointerEvent) => {
    if (sheet && !reduced && !(e.target as HTMLElement).closest("button, a, input, textarea, select")) drag.start(e);
  };

  const motionProps = desktop
    ? { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.96 }, style: { x: "-50%", y: "-50%" } }
    : { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" }, style: keyboard ? { bottom: keyboard, maxHeight: `calc(100dvh - ${keyboard}px - 12px)` } : undefined };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence onExitComplete={onExitComplete}>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                {...motionProps}
                {...dropProps}
                transition={reduced ? fade : sheetSpring}
                drag={sheet && !reduced ? "y" : false}
                dragControls={drag}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.8 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > CLOSE_OFFSET || info.velocity.y > CLOSE_VELOCITY) onOpenChange(false);
                }}
                className={`fixed z-50 flex flex-col bg-surface shadow-raised outline-none ${
                  desktop
                    ? `top-1/2 left-1/2 max-h-[86dvh] w-[calc(100vw-48px)] rounded-card ${wide ? "max-w-[820px]" : "max-w-[520px]"}`
                    : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-card pb-[var(--safe-bottom)]"
                } ${dragging ? "outline-4 -outline-offset-4 outline-accent" : ""}`}
              >
                <div onPointerDown={startDrag} style={sheet ? { touchAction: "none" } : undefined}>
                  {sheet && <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-fill-strong" />}
                  {bare ? (
                    <Dialog.Title className="sr-only">{title}</Dialog.Title>
                  ) : (
                    <div className="flex items-center gap-2 px-5 pt-3 pb-2">
                      <Dialog.Title className="min-w-0 flex-1 truncate text-lg font-bold">{title}</Dialog.Title>
                      {actions}
                      <Dialog.Close className="icon-btn -mr-2" aria-label="닫기">
                        <X size={22} strokeWidth={2} />
                      </Dialog.Close>
                    </div>
                  )}
                </div>
                <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${bare ? "p-3" : "px-5 pt-1 pb-5"}`}>{children}</div>
                {dragging && (
                  <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-accent-soft/90 text-md font-semibold text-accent-ink">
                    여기에 놓으면 첨부돼요
                  </div>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
