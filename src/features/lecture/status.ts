/** 강의 상태 칩. 홈에서는 시작 전 강의를 "곧 시작"(soon)으로 부른다. */
export const STATUS: Record<string, { label: string; className: string; dot?: boolean }> = {
  before: { label: "시작 전", className: "bg-fill-strong text-muted" },
  soon: { label: "곧 시작", className: "bg-accent-soft text-accent-ink" },
  open: { label: "진행 중", className: "bg-accent-soft text-accent-ink", dot: true },
  closed: { label: "종료", className: "bg-fill-strong text-muted" },
};
