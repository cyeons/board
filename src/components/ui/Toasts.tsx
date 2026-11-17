import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useWide } from "../../lib/device";
import { fade, sheetSpring } from "../../lib/motion";
import { dismissToast, holdToast, releaseToast, useToasts } from "../../lib/toast";

/** 화면 위쪽의 짧은 알림과, 아래쪽의 실행 취소 알림 */
export function Toasts() {
  const toasts = useToasts();
  const reduced = useReducedMotion();
  const wide = useWide();
  const from = wide ? -24 : 24;
  return (
    <div aria-live="polite" className={`pointer-events-none fixed inset-x-0 z-[70] flex items-center gap-2 px-4 ${wide ? "top-[calc(12px+var(--safe-top))] flex-col" : "bottom-[calc(92px+var(--safe-bottom))] flex-col-reverse"}`}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout={!reduced}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: from, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: from / 2, scale: 0.96 }}
            transition={reduced ? fade : sheetSpring}
            onPointerEnter={() => holdToast(t.id)}
            onPointerLeave={() => releaseToast(t.id)}
            className={`pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-[22px] py-3 pr-3 pl-5 font-medium text-on-accent shadow-raised ${t.tone === "error" ? "bg-danger" : "bg-ink/95 backdrop-blur"}`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                className="press min-h-11 shrink-0 rounded-full bg-white/15 px-4 text-sm font-bold"
                onClick={() => {
                  t.action!.run();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
