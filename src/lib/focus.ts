import { type RefObject, useEffect } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 직접 만든 전체 화면 창(카드 상세)의 포커스. 열면 창으로 옮기고, Tab이 창 밖으로 나가지 않게 돌리고,
 * 닫히면(움직임이 끝나 사라지면) 연 버튼으로 되돌린다. 위에 다른 창이 떠 있으면 그 창(Radix)이 맡는다.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current;
      if (e.key !== "Tab" || !root || document.querySelector("[role=dialog]:not([data-card-detail])")) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref]);
}
