/**
 * 이 보드를 다른 서비스에 붙일 때 바꾸는 값. 빌드할 때 .env의 값을 읽는다 (README 참고).
 * - VITE_APP_NAME: 탭 제목과 머리에 쓰는 이름
 * - VITE_HOME_URL: 머리의 이름을 누르면 갈 바깥 홈. 비우면 링크가 없다
 * - VITE_SHARE_PREFIX: 과정 주소 앞부분 (예: "example.com/"). 짧은 주소를 바깥 서비스가 넘겨 줄 때 쓴다.
 *   비우면 이 앱의 실제 주소(호스트 + /board/)를 쓴다
 */
export const APP_NAME: string = import.meta.env.VITE_APP_NAME || "보드";
export const HOME_URL: string | undefined = import.meta.env.VITE_HOME_URL || undefined;
export const sharePrefix = (): string => import.meta.env.VITE_SHARE_PREFIX || `${location.host}${import.meta.env.BASE_URL}`;
export const shareUrl = (slug: string) => `${sharePrefix()}${slug}`;
export const pageTitle = (title?: string) => (title ? `${APP_NAME} | ${title}` : APP_NAME);
