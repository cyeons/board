import type { ReactNode } from "react";

/** 떠 있는 버튼의 글자. 접히면 폭이 0으로 줄어 아이콘만 남는다 (버튼 이름은 aria-label이 계속 알린다). */
export function FabLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span aria-hidden={collapsed} className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-(--ease-out) ${collapsed ? "max-w-0 opacity-0" : "max-w-28 opacity-100"}`}>
      {children}
    </span>
  );
}
