import { motion, useDragControls, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { isStandalone } from "../../lib/device";
import { fade, pushSpring } from "../../lib/motion";

/**
 * 화면 하나. 깊이 들어가면(과정 홈 -> 강의) 오른쪽에서 밀려 들어오고, 돌아오면 왼쪽에서 들어온다.
 * 방향은 AnimatePresence의 custom으로 받는다. 나가는 화면도 같은 방향 값을 받아 반대로 빠진다.
 */
const variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? "28%" : "-10%" }),
  center: { opacity: 1, x: 0, transition: pushSpring },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? "-10%" : "28%", transition: { duration: 0.14, ease: "easeIn" as const } }),
};

/** 화면 왼쪽 끝에서 이만큼 안쪽을 잡아야 뒤로 가기 제스처가 시작된다 */
const EDGE = 24;

export function Page({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  const reduced = useReducedMotion();
  const drag = useDragControls();
  // iOS Safari는 브라우저 자체의 뒤로 가기 제스처와 겹치므로 홈 화면 앱으로 열었을 때만 켠다
  const swipeBack = Boolean(onBack) && !reduced && isStandalone();
  return (
    <motion.div
      variants={reduced ? undefined : variants}
      initial={reduced ? { opacity: 0 } : "enter"}
      animate={reduced ? { opacity: 1, transition: fade } : "center"}
      exit={reduced ? { opacity: 0, transition: fade } : "exit"}
      drag={swipeBack ? "x" : false}
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 1 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 100 || info.velocity.x > 500) onBack?.();
      }}
      onPointerDown={swipeBack ? (e) => e.clientX < EDGE && drag.start(e) : undefined}
      style={swipeBack ? { touchAction: "pan-y" } : undefined}
    >
      {children}
    </motion.div>
  );
}
