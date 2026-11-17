import { DurableObject } from "cloudflare:workers";

type Window = { start: number; count: number };

/**
 * 키 하나(예: `join:<IP>`)마다 하나. 고정 1분 창에서 횟수를 센다.
 * Rate Limiting 바인딩이 이 계정에서 막지 않아 대신 쓴다 (plan.md 14.3).
 */
export class RateLimiter extends DurableObject<Env> {
  async hit(limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const saved = await this.ctx.storage.get<Window>("w");
    const current = saved && now - saved.start < windowMs ? saved : { start: now, count: 0 };
    if (current.count >= limit) return false;
    // 저장한 뒤에 허락한다. 메모리에만 두면 쉬는 동안 사라진다.
    await this.ctx.storage.put("w", { start: current.start, count: current.count + 1 });
    return true;
  }
}
