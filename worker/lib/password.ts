// ponytail: 무료 요금제 CPU 10ms 때문에 낮은 반복 횟수를 쓴다. 대입 공격은 IP별 잠금이 막는다.
// 유료 요금제로 옮기면 올린다. 1-A 실측값은 plan.md 14.1 기준.
export const PBKDF2_ITERATIONS = 20_000;

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));

export function newSalt(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return hex(bits);
}
