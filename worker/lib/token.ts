const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(now = Date.now()): string {
  let time = "";
  for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = CROCKFORD[t % 32] + time;
  const random = crypto.getRandomValues(new Uint8Array(16));
  let rest = "";
  for (const b of random) rest += CROCKFORD[b % 32];
  return time + rest;
}

const toB64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export function randomToken(bytes = 32): string {
  return toB64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

/** 서명된 값. 쿠키와 실시간 연결 티켓에 쓴다. `exp`(밀리초)가 지나면 풀리지 않는다. */
export async function sign(secret: string, payload: { exp: number } & Record<string, unknown>): Promise<string> {
  const body = toB64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(body));
  return `${body}.${toB64Url(new Uint8Array(sig))}`;
}

export async function verify<T extends { exp: number }>(secret: string, value: string | undefined | null): Promise<T | null> {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64Url(sig), new TextEncoder().encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64Url(body))) as T;
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

/** 비밀 값 비교. 길이가 달라도 시간 차이가 나지 않도록 해시끼리 비교한다. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  return crypto.subtle.timingSafeEqual(new TextEncoder().encode(x), new TextEncoder().encode(y));
}
