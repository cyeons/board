export type LinkProvider = "youtube" | "google_docs" | "google_slides" | "google_drive" | "generic";

export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** `watch`, `youtu.be`, `shorts` 주소에서 영상 ID를 뽑는다. */
export function youtubeId(value: string): string | null {
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^(www|m)\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else if (/^\/(shorts|embed|live)\//.test(u.pathname)) id = u.pathname.split("/")[2] ?? null;
    }
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function linkProvider(value: string): LinkProvider {
  if (youtubeId(value)) return "youtube";
  try {
    const u = new URL(value);
    if (u.hostname === "docs.google.com") {
      if (u.pathname.startsWith("/presentation")) return "google_slides";
      return "google_docs";
    }
    if (u.hostname === "drive.google.com") return "google_drive";
  } catch {
    // 아래 generic
  }
  return "generic";
}

/** 내부 주소와 사설 IP를 막는다 (plan.md 12.5). */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) return true;
  if (h.includes(":")) return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:");
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
