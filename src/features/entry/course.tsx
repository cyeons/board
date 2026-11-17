import { createContext, useContext } from "react";

export type Group = { id: string; name: string; position: number; colorIndex: number };
export type Me = { publicId: string; nickname: string; groupId: string | null; avatarColor: number; courseId: string };
export type CourseInfo = { id: string; slug: string; title: string; instructorName: string; status: string };

export type CourseCtx = {
  course: CourseInfo;
  groups: Group[];
  me: Me | null;
  setMe: (me: Me | null) => void;
  /** 강사로 로그인했는지 */
  loggedIn: boolean;
  /** 강사 화면인지. 수강생으로 보기를 켜면 false */
  instructor: boolean;
  studentView: boolean;
  setStudentView: (v: boolean) => void;
};

export const CourseContext = createContext<CourseCtx | null>(null);

export function useCourse() {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error("CourseContext is missing");
  return ctx;
}

export const groupColor = (colorIndex: number) => `var(--group-${(colorIndex % 4) + 1})`;
export const groupSoftColor = (colorIndex: number) => `var(--group-${(colorIndex % 4) + 1}-soft)`;

/** 카드 아이콘 타일 색. 순서대로 6가지를 돌려 쓴다. */
export const tileColor = (index: number) => `var(--tile-${(index % 6) + 1})`;
