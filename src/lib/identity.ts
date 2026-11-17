/** localStorage는 막혀 있거나 비어 있을 수 있다. 쓰고 읽기가 실패해도 화면은 동작해야 한다. */
export function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 저장소를 못 쓰는 브라우저는 복구 쿠키에 기댄다
  }
}

let currentCourse: string | null = null;

export const setActiveCourse = (courseId: string | null) => {
  currentCourse = courseId;
};

const tokenKey = (courseId: string) => `board:token:${courseId}`;

export const activeToken = () => (currentCourse ? readStore(tokenKey(currentCourse)) : null);
export const saveToken = (courseId: string, token: string) => writeStore(tokenKey(courseId), token);
export const clearToken = (courseId: string) => writeStore(tokenKey(courseId), null);
export const hasToken = (courseId: string) => Boolean(readStore(tokenKey(courseId)));

const NICK_KEY = "board:nickname";
export const lastNickname = () => readStore(NICK_KEY) ?? "";
export const saveNickname = (name: string | null) => writeStore(NICK_KEY, name);

export type Visited = { slug: string; title: string };
const VISITED_KEY = "board:visited";

export function visitedCourses(): Visited[] {
  try {
    return JSON.parse(readStore(VISITED_KEY) ?? "[]") as Visited[];
  } catch {
    return [];
  }
}

/** 이 기기에서 들어간 과정. 맨 앞이 마지막으로 들어간 과정이다. */
export function rememberCourse(course: Visited) {
  const rest = visitedCourses().filter((v) => v.slug !== course.slug);
  writeStore(VISITED_KEY, JSON.stringify([course, ...rest].slice(0, 12)));
}
