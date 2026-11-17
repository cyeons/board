export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

export const notFound = (what = "찾을 수 없어요. 주소를 다시 확인해 주세요."): never => fail(404, "not_found", what);
export const forbidden = (what = "이 작업을 할 수 있는 권한이 없어요."): never => fail(403, "forbidden", what);
export const locked = (what = "강의가 진행 중일 때만 할 수 있어요."): never => fail(423, "locked", what);
export const tooMany = (): never => fail(429, "rate_limited", "잠시 후 다시 시도해 주세요.");
