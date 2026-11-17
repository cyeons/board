/** 과정 이름으로 쓸 수 없는 주소 (plan.md 4.1, 4.2). 보드가 쓰는 첫 단계 주소다. 짧은 주소를 바깥 서비스에 붙이면 그 서비스의 주소도 여기에 넣는다. */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "ws", "assets",
  "board", "보드", "icons", "manifest.webmanifest",
]);

/** 공백은 하이픈으로, 영문은 소문자로, 한글은 NFC로 맞춘다. */
export function normalizeSlug(input: string): string {
  return input.normalize("NFC").trim().replace(/\s+/g, "-").toLowerCase();
}

export type SlugProblem = "empty" | "too_long" | "bad_chars" | "reserved";

export function slugProblem(slug: string): SlugProblem | null {
  if (!slug || /^-+$/.test(slug)) return "empty";
  if (slug.length > 30) return "too_long";
  if (!/^[가-힣a-z0-9-]+$/.test(slug)) return "bad_chars";
  if (RESERVED_SLUGS.has(slug)) return "reserved";
  return null;
}

export const SLUG_MESSAGES: Record<SlugProblem, string> = {
  empty: "주소를 입력해 주세요.",
  too_long: "주소는 30자까지 쓸 수 있어요.",
  bad_chars: "주소에는 한글, 영문, 숫자, 하이픈(-)만 쓸 수 있어요.",
  reserved: "이미 쓰이는 주소예요. 다른 주소를 골라 주세요.",
};
