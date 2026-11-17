import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
import { haptic } from "../../lib/haptics";
import { sheetSpring } from "../../lib/motion";

const TRIGGER = 72;
const HOLD = 56;

/**
 * 맨 위에서 아래로 당기면 새로고침한다 (터치 기기만).
 * 브라우저의 당김은 tokens.css의 overscroll-behavior로 막고, 화면을 직접 끌어내린다.
 */
export function PullToRefresh({ onRefresh, children, scroller }: { onRefresh: () => Promise<unknown>; children: ReactNode; scroller?: () => HTMLElement | null }) {
  const reduced = useReducedMotion();
  const y = useMotionValue(0);
  const start = useRef<number | null>(null);
  const armed = useRef(false);
  const [busy, setBusy] = useState(false);
  const spinnerOpacity = useTransform(y, [0, TRIGGER * 0.6, TRIGGER], [0, 0.5, 1]);
  const spinnerTurn = useTransform(y, [0, TRIGGER], [0, 270]);

  const atTop = () => (scroller ? (scroller()?.scrollTop ?? 0) : window.scrollY) <= 0;
  const settle = (to: number) => animate(y, to, reduced ? { duration: 0.15 } : sheetSpring);

  return (
    <div
      onTouchStart={(e) => {
        // 위에 뜬 창(시트, 카드 상세) 안에서 당긴 것은 이 화면의 새로고침이 아니다
        const inLayer = !scroller && (e.target as Element).closest("[role=dialog], [data-card-detail]");
        start.current = !busy && !inLayer && atTop() ? e.touches[0]!.clientY : null;
      }}
      onTouchMove={(e) => {
        if (start.current === null) return;
        const dy = e.touches[0]!.clientY - start.current;
        if (dy <= 0 || !atTop()) return y.set(0);
        // 당길수록 덜 따라오는 고무줄 느낌
        const pulled = Math.min(140, dy * 0.5);
        y.set(pulled);
        if (pulled >= TRIGGER && !armed.current) haptic();
        armed.current = pulled >= TRIGGER;
      }}
      onTouchEnd={async () => {
        if (start.current === null) return;
        start.current = null;
        if (!armed.current) return void settle(0);
        armed.current = false;
        setBusy(true);
        settle(HOLD);
        try {
          await onRefresh();
        } finally {
          await settle(0);
          setBusy(false);
        }
      }}
    >
      <motion.div aria-hidden style={{ opacity: spinnerOpacity, height: y }} className="flex items-end justify-center overflow-hidden">
        <motion.span
          style={busy ? undefined : { rotate: spinnerTurn }}
          className={`mb-3 block size-6 rounded-full border-[2.5px] border-accent border-r-transparent ${busy ? "animate-[spin_0.7s_linear_infinite]" : ""}`}
        />
      </motion.div>
      {busy && <span className="sr-only" role="status">새로 불러오는 중이에요</span>}
      {children}
    </div>
  );
}
