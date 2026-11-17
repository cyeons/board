import { useEffect, useState, useSyncExternalStore } from "react";

const ua = () => navigator.userAgent;

export const isKakao = () => /KAKAOTALK/i.test(ua());
export const isInApp = () => /KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\//i.test(ua());

/** 휴대폰과 태블릿. iPadOS는 Mac으로 나오므로 터치 지점 수까지 본다. */
export const isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(ua()) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const canCaptureScreen = () => !isMobileDevice() && !isInApp() && Boolean(navigator.mediaDevices?.getDisplayMedia);

export const canUseWebcam = () => !isMobileDevice() && Boolean(navigator.mediaDevices?.getUserMedia);

export const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** 화면 폭 같은 미디어 조건을 따라 다시 그린다. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** 컴퓨터 배치(가운데 창, 팝오버)를 쓸 폭 */
export const useWide = () => useMediaQuery("(min-width: 640px)");

/**
 * 화면 키보드가 가린 높이. iPhone Safari와 Android Chrome은 키보드가 올라와도 창 높이를 그대로 두고
 * 보이는 영역(visualViewport)만 줄이므로, 아래에 붙은 시트를 그만큼 올려야 입력칸과 버튼이 보인다.
 * 주소 막대가 접히는 정도의 작은 변화는 무시한다.
 */
export function useKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered > 80 ? covered : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setInset(0);
    };
  }, [enabled]);
  return inset;
}
