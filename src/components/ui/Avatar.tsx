/** 아바타 색: 연한 바탕과 진한 글자 한 쌍. 공개 ID로 정한 번호를 돌려 쓴다 (plan.md 5.1). */
const COLORS: [string, string][] = [
  ["var(--tile-4)", "var(--group-4)"],
  ["var(--tile-2)", "var(--group-1)"],
  ["var(--tile-1)", "var(--group-2)"],
  ["var(--tile-3)", "var(--group-3)"],
  ["var(--tile-5)", "#5b4ba0"],
  ["#dff2f5", "#1f6b78"],
  ["var(--tile-6)", "#9a5520"],
  ["#ebf1dc", "#4f6324"],
];

export function Avatar({ name, color, size = 36, instructor }: { name: string; color: number; size?: number; instructor?: boolean }) {
  const [bg, ink] = instructor ? ["var(--accent)", "var(--on-accent)"] : COLORS[color % COLORS.length]!;
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none" style={{ width: size, height: size, fontSize: size * 0.4, background: bg, color: ink }}>
      {[...name][0] ?? "?"}
    </span>
  );
}

export const InstructorBadge = () => <span className="chip bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">강사</span>;
