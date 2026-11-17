/** 오늘 날짜 (KST, YYYY-MM-DD) */
export const todayKst = (now = Date.now()) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export function formatDate(date: string) {
  const d = new Date(`${date}T00:00:00+09:00`);
  const kst = new Date(d.getTime() + 9 * 3_600_000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${DAY_NAMES[kst.getUTCDay()]}요일`;
}

export function kstParts(ms: number) {
  const iso = new Date(ms + 9 * 3_600_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function timeAgo(ms: number, now = Date.now()) {
  const sec = Math.floor((now - ms) / 1000);
  if (sec < 60) return "방금";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  const { date, time } = kstParts(ms);
  if (date === todayKst(now)) return `오늘 ${time}`;
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${time}`;
}

export function dueLabel(ms: number, now = Date.now()) {
  const { date, time } = kstParts(ms);
  const today = todayKst(now);
  const tomorrow = todayKst(now + 86_400_000);
  const day = date === today ? "오늘" : date === tomorrow ? "내일" : `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
  return `${day} ${time} 마감${ms < now ? " 지남" : ""}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}

/** `YYYY-MM-DD`와 `HH:mm`(KST)을 UTC 밀리초로 */
export const kstToMs = (date: string, time: string) => Date.parse(`${date}T${time}:00+09:00`);

/** 마감이 급한지: 이미 지났거나 24시간 안이면 눈에 띄게(빨강), 그 밖에는 차분하게(회색) 보여 준다. */
export function dueTone(ms: number, now = Date.now()): "over" | "soon" | "later" {
  if (ms < now) return "over";
  return ms - now <= 86_400_000 ? "soon" : "later";
}

export const DUE_CHIP: Record<ReturnType<typeof dueTone>, string> = {
  over: "bg-danger-soft text-danger",
  soon: "bg-danger-soft text-danger",
  later: "bg-fill-strong text-muted",
};
