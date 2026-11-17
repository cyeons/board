import { APP_NAME, HOME_URL } from "../lib/brand";

/**
 * 모든 화면 위의 상단 바.
 * 높이는 --bar-h이고 --safe-top에 들어 있어서, 위쪽을 비워 두는 화면은 모두 이 바 아래에서 시작한다.
 */
export function AppBar() {
  return (
    <header className="fixed inset-x-0 top-0 z-[47] border-b border-line bg-surface pt-[env(safe-area-inset-top,0px)]">
      <div className="flex h-[var(--bar-h)] items-center gap-3 pr-0.5 pl-3 md:gap-4 md:pl-4">
        {HOME_URL ? (
          <a href={HOME_URL} aria-label={`${APP_NAME} 홈`} className="flex h-11 min-w-0 items-center truncate text-sm font-bold">
            {APP_NAME}
          </a>
        ) : (
          <p className="min-w-0 truncate text-sm font-bold">{APP_NAME}</p>
        )}
      </div>
    </header>
  );
}
