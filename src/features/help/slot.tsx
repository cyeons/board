import { Suspense, lazy } from "react";
import { useCourse } from "../entry/course";

const HelpPanel = lazy(() => import("./HelpPanel"));

/** 강사로 로그인하면 모든 화면 오른쪽에 도움 요청함이 열린다. 수강생은 불러오지 않는다. */
export function HelpPanelSlot() {
  const { loggedIn, course, groups } = useCourse();
  if (!loggedIn) return null;
  return (
    <Suspense fallback={null}>
      <HelpPanel courseId={course.id} groups={groups} />
    </Suspense>
  );
}
