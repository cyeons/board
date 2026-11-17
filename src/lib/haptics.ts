/** 짧은 진동. Android에서만 동작하고(iPhone Safari는 지원하지 않음), 동작 줄이기를 켜면 울리지 않는다. */
export function haptic(ms = 10) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate?.(ms);
}
