import { useEffect, useState } from "react";
import { api, unwrap } from "./api";

export type Variant = "thumb" | "inline" | "download";

const BATCH = 50;
const REUSE_MS = 50 * 60_000;

type Pending = { key: string; fileId: string; variant: Variant; resolve: (url: string | null) => void };

const cache = new Map<string, { url: string | null; at: number }>();
let queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const work = queue;
  queue = [];
  for (let i = 0; i < work.length; i += BATCH) {
    const part = work.slice(i, i + BATCH);
    try {
      const { urls } = await unwrap(api.files.urls.$post({ json: { items: part.map((p) => ({ fileId: p.fileId, variant: p.variant })) } }));
      for (const p of part) {
        const url = urls[p.key] ?? null;
        cache.set(p.key, { url, at: Date.now() });
        p.resolve(url);
      }
    } catch {
      for (const p of part) p.resolve(null);
    }
  }
}

/** 파일 주소를 모아서 한 번에 받는다. 같은 주소는 50분 동안 다시 쓴다 (plan.md 12.3). */
export function fileUrl(fileId: string, variant: Variant): Promise<string | null> {
  const key = `${fileId}:${variant}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REUSE_MS) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    queue.push({ key, fileId, variant, resolve });
    timer ??= setTimeout(flush, 30);
  });
}

export function useFileUrl(fileId: string | null | undefined, variant: Variant) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (fileId) void fileUrl(fileId, variant).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [fileId, variant]);
  return url;
}
