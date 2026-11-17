import { defineConfig } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: "desktop" },
    {
      name: "phone",
      use: {
        viewport: { width: 375, height: 760 },
        hasTouch: true,
        isMobile: true,
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
      },
    },
  ],
  webServer: {
    command: `npx wrangler d1 migrations apply DB --local && npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/board/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
  },
});
