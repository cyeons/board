import { Zip, ZipPassThrough } from "fflate";
import { ApiFailure } from "../../lib/api";

export const ZIP_LIMIT = 500 * 1024 * 1024;

export type ZipItem = { name: string; size: number; url: () => Promise<string | null> };

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const uniqueName = (name: string, used: Set<string>) => {
  let candidate = name;
  const dot = name.lastIndexOf(".");
  for (let i = 1; used.has(candidate); i++) candidate = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
  used.add(candidate);
  return candidate;
};

/** 파일을 하나씩 받아 압축 없이 묶는다. 조각으로 나눠 받아 메모리 사용을 줄인다 (plan.md 12.4). */
export async function zipFiles(items: ZipItem[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const total = items.reduce((sum, i) => sum + i.size, 0);
  if (total > ZIP_LIMIT) throw new ApiFailure(413, "too_large", "파일이 많아서 강의별 백업이나 개별 다운로드를 권해요.");
  const parts: BlobPart[] = [];
  let finish!: () => void;
  let fail!: (e: unknown) => void;
  const ended = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) return fail(err);
    parts.push(chunk.slice());
    if (final) finish();
  });
  const used = new Set<string>();
  for (const [index, item] of items.entries()) {
    const url = await item.url();
    if (!url) throw new ApiFailure(404, "missing", `${item.name} 파일을 받을 수 없어요.`);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new ApiFailure(res.status, "missing", `${item.name} 파일을 받을 수 없어요.`);
    const entry = new ZipPassThrough(uniqueName(item.name, used));
    zip.add(entry);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      entry.push(value);
    }
    entry.push(new Uint8Array(0), true);
    onProgress?.(index + 1, items.length);
  }
  zip.end();
  await ended;
  return new Blob(parts, { type: "application/zip" });
}
