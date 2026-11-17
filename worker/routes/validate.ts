import { fail } from "../lib/errors";

/** zValidator의 실패 처리. 첫 번째 문구를 그대로 화면에 띄울 수 있게 돌려준다. */
export function invalid(result: { success: boolean; error?: unknown }) {
  if (result.success) return;
  const issues = (result.error as { issues?: { message: string; code?: string }[] } | undefined)?.issues ?? [];
  const custom = issues.find((i) => /[가-힣]/.test(i.message));
  fail(400, "invalid", custom?.message ?? "입력한 내용을 다시 확인해 주세요.");
}
