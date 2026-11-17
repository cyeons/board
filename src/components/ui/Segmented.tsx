import { motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { fade, spring } from "../../lib/motion";

/**
 * iOS식 나눔 버튼. 고른 칸의 흰 바탕이 미끄러져 옮겨 간다.
 * 흰 바탕은 고른 버튼의 위치와 폭을 재서 움직인다. 공유 레이아웃(layoutId)을 쓰면 카드 상세처럼
 * 부모가 커지는 동안 바탕이 엉뚱한 곳에 그려진다.
 * 탭 목록의 키보드 관례대로 고른 칸만 Tab으로 들어오고, 좌우 화살표로 옮겨 고른다.
 */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const reduced = useReducedMotion();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);
  const index = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const el = buttons.current[index];
    if (el) setPill({ x: el.offsetLeft, width: el.offsetWidth });
  }, [index, options]);

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next]!.value);
    buttons.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className="relative inline-flex rounded-full bg-fill-strong p-1" onKeyDown={onKeyDown}>
      {pill && (
        <motion.span
          aria-hidden
          className="absolute top-1 bottom-1 left-0 rounded-full bg-surface shadow-base"
          initial={false}
          animate={{ x: pill.x, width: pill.width }}
          transition={reduced ? fade : spring}
        />
      )}
      {options.map((o, i) => {
        const on = i === index;
        return (
          <button
            key={o.value}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`relative min-h-11 rounded-full px-4 text-sm font-semibold transition-colors ${on ? "text-ink" : "text-muted hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
