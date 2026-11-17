/** 브라우저 오류를 서버 로그로 보낸다 (plan.md 19.3). */
function report(message: string, stack?: string | null) {
  try {
    void fetch("/board/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: message.slice(0, 1000), stack: stack?.slice(0, 4000), url: location.pathname }),
      keepalive: true,
    });
  } catch {
    // 보고가 실패해도 화면에는 영향이 없어야 한다
  }
}

const isChunkError = (message: string) => /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message);

/** 배포 뒤 옛 JS 조각을 못 불러오면 한 번만 새로고침한다 (plan.md 16.2). */
function reloadOnce() {
  const key = "board:chunk-reload";
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    return;
  }
  location.reload();
}

export function installErrorReporting() {
  window.addEventListener("error", (e) => {
    if (isChunkError(e.message)) return reloadOnce();
    report(e.message, (e.error as Error | undefined)?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason as Error | undefined;
    if (isChunkError(String(reason?.message))) return reloadOnce();
    report(String(reason?.message ?? e.reason), reason?.stack);
  });
  window.addEventListener("vite:preloadError", () => reloadOnce());
}
