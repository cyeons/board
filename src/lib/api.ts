import { hc } from "hono/client";
import type { AppType } from "../../worker/index";
import { activeToken } from "./identity";

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const api = hc<AppType>("/", {
  headers: (): Record<string, string> => {
    const token = activeToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
}).board.api;

/** 응답을 풀어 준다. 실패하면 서버가 보낸 한국어 문장을 그대로 담아 던진다. */
export async function unwrap<R extends { ok: boolean; status: number; json(): Promise<unknown> }>(request: Promise<R>): Promise<Awaited<ReturnType<R["json"]>>> {
  let res: R;
  try {
    res = await request;
  } catch {
    throw new ApiFailure(0, "network", "인터넷 연결을 확인하고 다시 시도해 주세요.");
  }
  if (res.ok) return res.json() as Promise<Awaited<ReturnType<R["json"]>>>;
  const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  throw new ApiFailure(res.status, body?.error?.code ?? "unknown", body?.error?.message ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
}

export const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : "문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
