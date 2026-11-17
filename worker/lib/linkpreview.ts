import { isBlockedHost, isHttpUrl, linkProvider, youtubeId } from "./links";

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 3000;
const MAX_REDIRECTS = 3;

export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site: string;
  provider: ReturnType<typeof linkProvider>;
};

async function fetchHtml(start: string, signal: AbortSignal): Promise<string | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = new URL(url);
    if (!isHttpUrl(url) || isBlockedHost(target.hostname)) return null;
    const res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { "user-agent": "Board/1.0 (link preview)", accept: "text/html" },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel();
      if (!next) return null;
      url = new URL(next, url).toString();
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html") || !res.body) {
      await res.body?.cancel();
      return null;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    await reader.cancel();
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.byteLength;
    }
    return new TextDecoder().decode(bytes.subarray(0, MAX_BYTES));
  }
  return null;
}

async function readMeta(html: string) {
  const meta: Record<string, string> = {};
  let title = "";
  await new HTMLRewriter()
    .on("meta", {
      element(el) {
        const key = el.getAttribute("property") ?? el.getAttribute("name");
        const content = el.getAttribute("content");
        if (key && content && !meta[key]) meta[key] = content;
      },
    })
    .on("title", {
      text(chunk) {
        title += chunk.text;
      },
    })
    .transform(new Response(html))
    .text();
  return { meta, title: title.trim() };
}

export async function linkPreview(url: string): Promise<LinkPreview> {
  const base: LinkPreview = {
    url,
    title: null,
    description: null,
    image: null,
    site: new URL(url).hostname.replace(/^www\./, ""),
    provider: linkProvider(url),
  };
  const video = youtubeId(url);
  if (video) base.image = `https://i.ytimg.com/vi/${video}/hqdefault.jpg`;
  try {
    const html = await fetchHtml(url, AbortSignal.timeout(TIMEOUT_MS));
    if (!html) return base;
    const { meta, title } = await readMeta(html);
    const image = meta["og:image"];
    return {
      ...base,
      title: (meta["og:title"] ?? title).slice(0, 200) || null,
      description: (meta["og:description"] ?? meta["description"] ?? "").slice(0, 300) || null,
      image: image && isHttpUrl(new URL(image, url).toString()) ? new URL(image, url).toString() : base.image,
    };
  } catch {
    return base;
  }
}
