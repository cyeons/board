// 빌드한 화면 파일을 dist/client/board/ 아래로 옮긴다.
// 경로가 /board/* 인 Worker에서 정적 파일 주소를 /board/...로 맞추려면 assets.base_path가 필요한데,
// 이 계정에서는 아직 켜져 있지 않다 (code 100343). base_path를 쓸 수 있게 되면 이 단계를 지운다.
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const root = "dist/client";
const nested = join(root, "board");
// 정적 파일 설정은 자산 폴더의 맨 위에 있어야 한다
const keep = new Set(["_headers", "_redirects", ".assetsignore", "board"]);

if (!existsSync(join(root, "index.html"))) throw new Error("dist/client/index.html이 없어요. vite build를 먼저 실행해 주세요.");
mkdirSync(nested, { recursive: true });
for (const name of readdirSync(root)) {
  if (!keep.has(name)) renameSync(join(root, name), join(nested, name));
}
// SPA 대체 응답은 자산 폴더 맨 위의 index.html을 쓴다. 안의 경로는 모두 /board/로 시작한다.
copyFileSync(join(nested, "index.html"), join(root, "index.html"));
console.log("화면 파일을 dist/client/board/로 옮겼어요.");
