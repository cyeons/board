import { useEffect, useSyncExternalStore } from "react";

/*
 * 떠 있는 버튼(글쓰기, 도움 요청)을 아래로 스크롤하는 동안 아이콘만 남기고 접는다. 위로 올리면 다시 펼친다.
 * 강의 화면(창 스크롤)과 카드 상세(안쪽 스크롤 상자) 어디서 스크롤해도 같은 상태를 쓴다.
 */
let collapsed = false;
const listeners = new Set<() => void>();
const lastTop = new WeakMap<EventTarget, number>();

function set(next: boolean) {
  if (next === collapsed) return;
  collapsed = next;
  for (const fn of listeners) fn();
}

/** 맨 위 근처이거나 위로 올리면 펼치고, 아래로 내리면 접는다. 조금 흔들린 것은 무시한다. */
function track(target: EventTarget, top: number) {
  const prev = lastTop.get(target) ?? top;
  lastTop.set(target, top);
  if (top < 80) set(false);
  else if (top - prev > 6) set(true);
  else if (prev - top > 6) set(false);
}

export const useFabCollapsed = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => collapsed,
  );

/** 창 스크롤(target 없음) 또는 그 요소 안쪽의 모든 스크롤 상자를 지켜본다. 화면을 떠나면 펼친 상태로 되돌린다. */
export function useCollapseOnScroll(target?: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = target ? target.current : window;
    if (!el) return;
    const onScroll = (e: Event) => {
      const node = e.target;
      if (node instanceof HTMLElement) track(node, node.scrollTop);
      else track(window, window.scrollY);
    };
    el.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll, { capture: true });
      set(false);
    };
  }, [target]);
}
