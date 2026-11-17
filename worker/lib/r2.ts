import { AwsClient } from "aws4fetch";
import { sign, verify } from "./token";

export const UPLOAD_TTL_SECONDS = 600;
export const DOWNLOAD_TTL_SECONDS = 3600;

const hasS3Keys = (env: Env) => Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ACCOUNT_ID);

function client(env: Env) {
  return new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
}

function objectUrl(env: Env, key: string) {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${path}`);
}

/** 원래 파일 이름을 유지하는 Content-Disposition (RFC 5987). */
export function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * 로컬 개발에는 S3 API가 없으므로 Worker가 R2 바인딩으로 대신 받는다.
 * `DEV_FILE_PROXY`는 .dev.vars와 테스트에만 있고, 실제 환경에는 넣지 않는다.
 */
const devUrl = async (env: Env, origin: string, payload: Record<string, unknown>, ttl: number) =>
  `${origin}/board/api/dev-files/${await sign(env.SESSION_SECRET, { ...payload, exp: Date.now() + ttl * 1000 })}`;

/**
 * 올리기 주소와, 브라우저가 그대로 보내야 하는 서명된 헤더.
 * `If-None-Match: *` 덕분에 한 번 올린 뒤에는 같은 주소로 덮어쓸 수 없어서, complete에서 확인한 크기와 형식이 그 뒤에도 유지된다 (R2 CORS 허용 필요).
 */
export async function presignPut(env: Env, origin: string, key: string, mime: string): Promise<{ url: string; headers: Record<string, string> }> {
  const headers = { "Content-Type": mime, "If-None-Match": "*" };
  if (!hasS3Keys(env)) {
    if (env.DEV_FILE_PROXY !== "1") throw new Error("R2 keys are missing");
    return { url: await devUrl(env, origin, { op: "put", key, mime }, UPLOAD_TTL_SECONDS), headers };
  }
  const url = objectUrl(env, key);
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_TTL_SECONDS));
  const signed = await client(env).sign(new Request(url, { method: "PUT", headers }), { aws: { signQuery: true, allHeaders: true } });
  return { url: signed.url, headers };
}

export async function presignGet(env: Env, origin: string, key: string, opts: { disposition?: string; mime?: string } = {}): Promise<string> {
  if (!hasS3Keys(env)) {
    if (env.DEV_FILE_PROXY !== "1") throw new Error("R2 keys are missing");
    return devUrl(env, origin, { op: "get", key, ...opts }, DOWNLOAD_TTL_SECONDS);
  }
  const url = objectUrl(env, key);
  url.searchParams.set("X-Amz-Expires", String(DOWNLOAD_TTL_SECONDS));
  if (opts.disposition) url.searchParams.set("response-content-disposition", opts.disposition);
  if (opts.mime) url.searchParams.set("response-content-type", opts.mime);
  const signed = await client(env).sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } });
  return signed.url;
}

type DevTicket = { exp: number; op: "put" | "get"; key: string; mime?: string; disposition?: string };

/** 로컬 개발 전용 파일 경로. `DEV_FILE_PROXY`가 없으면 404다. */
export async function handleDevFile(env: Env, ticket: string, req: Request): Promise<Response> {
  const notFound = new Response("not found", { status: 404 });
  if (env.DEV_FILE_PROXY !== "1") return notFound;
  const t = await verify<DevTicket>(env.SESSION_SECRET, ticket);
  if (!t) return new Response("expired", { status: 403 });
  if (t.op === "put" && req.method === "PUT") {
    // 실제 R2의 If-None-Match: * 와 같게 이미 있는 파일은 덮어쓰지 않는다
    if (await env.FILES.head(t.key)) return new Response("exists", { status: 412 });
    await env.FILES.put(t.key, req.body, { httpMetadata: { contentType: req.headers.get("content-type") ?? "application/octet-stream" } });
    return new Response(null, { status: 200 });
  }
  if (t.op === "get" && req.method === "GET") {
    const obj = await env.FILES.get(t.key);
    if (!obj) return notFound;
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    if (t.mime) headers.set("content-type", t.mime);
    if (t.disposition) headers.set("content-disposition", t.disposition);
    return new Response(obj.body, { headers });
  }
  return notFound;
}
