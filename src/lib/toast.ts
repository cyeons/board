import { useSyncExternalStore } from "react";

export type Toast = { id: number; message: string; action?: { label: string; run: () => void }; tone?: "error" };

let items: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());
const timers = new Map<number, { timer: ReturnType<typeof setTimeout>; ms: number }>();

function schedule(id: number, ms: number) {
  clearTimeout(timers.get(id)?.timer);
  timers.set(id, { ms, timer: setTimeout(() => dismissToast(id), ms) });
}

export function dismissToast(id: number) {
  clearTimeout(timers.get(id)?.timer);
  timers.delete(id);
  items = items.filter((t) => t.id !== id);
  publish();
}

/** 마우스를 올리거나 누르고 있는 동안에는 닫지 않는다 */
export const holdToast = (id: number) => clearTimeout(timers.get(id)?.timer);
export function releaseToast(id: number) {
  const t = timers.get(id);
  if (t) schedule(id, t.ms);
}

export function toast(message: string, opts: { action?: Toast["action"]; tone?: "error"; ms?: number } = {}) {
  const id = nextId++;
  items = [...items, { id, message, action: opts.action, tone: opts.tone }].slice(-3);
  publish();
  // 실행 취소는 서버가 10초까지 받아 준다. 읽고 누를 시간을 넉넉히 준다
  schedule(id, opts.ms ?? (opts.action ? 8000 : 3500));
  return id;
}

export const toastError = (e: unknown) => toast(e instanceof Error ? e.message : "문제가 생겼어요. 잠시 후 다시 시도해 주세요.", { tone: "error" });

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
}
