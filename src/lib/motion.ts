import type { Transition, Variants } from "motion/react";

/*
 * 움직임 프리셋 (plan.md 7.5). 토스, iOS처럼 손의 움직임을 따라오는 스프링을 쓴다.
 * 동작 줄이기에서는 위치 이동 없이 투명도만 바꾼다.
 */

/** 버튼, 카드를 누를 때 */
export const tapSpring: Transition = { type: "spring", stiffness: 700, damping: 34 };
/** 일반 UI 상태 변화 (탭 표시, 스위치, 목록 재배치) */
export const spring: Transition = { type: "spring", stiffness: 500, damping: 38 };
/** 공유 레이아웃(layoutId)으로 커지고 줄어들 때. 견본 화면에만 남아 있다. */
export const pageSpring: Transition = { type: "spring", stiffness: 340, damping: 34 };
/** 카드 상세가 카드 자리에서 열리고 접힐 때. 빠르게 출발해 부드럽게 멈추고, 출렁이지 않는다 */
export const pageOpen: Transition = { duration: 0.42, ease: [0.32, 0.72, 0, 1] };
/** 카드 자리를 모를 때 카드 상세가 열리고 닫히는 짧은 전환 */
export const pageFade: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };
/** 아래에서 올라오는 시트 */
export const sheetSpring: Transition = { type: "spring", stiffness: 420, damping: 40 };
/** 옆에서 밀려 들어오는 화면 */
export const pushSpring: Transition = { type: "spring", stiffness: 380, damping: 40 };
/** 동작 줄이기에서 쓰는 짧은 전환 */
export const fade: Transition = { duration: 0.18 };

/** 누르면 줄어드는 카드. 컴퓨터에서는 올리면 아주 살짝 떠오른다. */
export const hoverLift = { whileHover: { y: -2, boxShadow: "var(--shadow-raised)" }, whileTap: { scale: 0.97 }, transition: tapSpring };
export const pressable = { whileTap: { scale: 0.97 }, transition: tapSpring };

/** 스크롤 등장, 새 게시물 등장 */
export const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

/** 동작 줄이기: 위치 이동 없이 투명도만 */
export const riseReduced: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.18 } },
};
