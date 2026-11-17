import { AnimatePresence, LayoutGroup } from "motion/react";
import { Suspense, lazy, useEffect, useState } from "react";
import { Route, Routes, useLocation, useParams } from "react-router";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { Link } from "react-router";
import { ApiFailure, errorText } from "../../lib/api";
import { useCollapseOnScroll } from "../../lib/fab";
import { formatDate } from "../../lib/format";
import { useLecture } from "../../lib/queries";
import { useLectureRoom } from "../../lib/realtime";
import { useCourse } from "../entry/course";
import { HelpButton } from "../help/HelpButton";
import { InstructorBar } from "./InstructorBar";
import { NoticeCard } from "./NoticeCard";
import { STATUS } from "./status";
import { Stream } from "./Stream";
import { pageTitle } from "../../lib/brand";

const CardDetail = lazy(() => import("../card/CardDetail"));


export default function LecturePage() {
  const { lectureId = "" } = useParams();
  const location = useLocation();
  const cardId = location.pathname.match(/\/c\/([^/]+)/)?.[1];
  const { course, instructor, loggedIn, studentView } = useCourse();
  const [editing, setEditing] = useState(false);
  const lecture = useLecture(lectureId);
  useCollapseOnScroll();
  // 시작 전에도 연결해 두면 강사가 시작하는 순간 모두의 화면이 함께 열린다
  const presence = useLectureRoom(lectureId, Boolean(lecture.data), { isInstructor: loggedIn, slug: course.slug });

  useEffect(() => {
    if (lecture.data) document.title = pageTitle(lecture.data.lecture.title);
  }, [lecture.data]);

  if (lecture.isError) {
    const hidden = lecture.error instanceof ApiFailure && lecture.error.status === 404;
    return (
      <main className="mx-auto max-w-[720px] px-[var(--gutter)]">
        <div role="alert" className="surface space-y-4 rounded-card p-6">
          <p>{hidden ? "이 강의는 지금 볼 수 없어요. 강사님이 공개하면 다시 열려요." : errorText(lecture.error)}</p>
          <Link to={`/${encodeURIComponent(course.slug)}`} className="btn btn-ghost">
            과정 홈으로 가기
          </Link>
        </div>
      </main>
    );
  }
  if (!lecture.data) return <PageSkeleton />;

  const { lecture: info, notice } = lecture.data;
  const status = STATUS[info.status]!;

  // 수강생으로 보기는 숨긴 카드까지 수강생 화면 그대로 보여 준다
  const cards = studentView ? lecture.data.cards.filter((c) => c.visible) : lecture.data.cards;
  const locked = lecture.data.locked || (studentView && info.status === "before");

  return (
    <LayoutGroup>
      {loggedIn && <InstructorBar lecture={info} presence={presence} editing={editing} setEditing={setEditing} />}
      <main className="mx-auto max-w-[720px] space-y-4 px-[var(--gutter)] pb-28">
        <div className="pt-1 pb-2">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted">
            <span>
              {formatDate(info.date)} {info.startTime}
            </span>
            <span className={`chip ${status.className}`}>
              {status.dot && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
              {status.label}
            </span>
            {course.status === "ended" && <span className="chip bg-fill-strong text-muted">종료된 과정</span>}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold">{info.title}</h1>
          {info.description && <p className="mt-2 text-muted">{info.description}</p>}
        </div>

        {locked ? (
          <div className="surface rounded-card px-6 py-12 text-center">
            <p aria-hidden className="emoji mb-4 text-5xl">⏰</p>
            <p className="text-lg font-bold">곧 시작해요</p>
            <p className="mt-1 text-muted">
              {formatDate(info.date)} {info.startTime}에 강사님이 시작하면 자료가 열려요.
            </p>
          </div>
        ) : (
          <>
            <NoticeCard lecture={info} notice={notice} editing={instructor && editing} />
            <Stream lectureId={info.id} cards={cards} editing={instructor && editing} />
          </>
        )}
      </main>
      {!presence.connected && !loggedIn && (
        <p role="status" className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+64px)] z-20 flex justify-center">
          <span className="rounded-full bg-ink/85 px-3 py-1 text-sm font-medium text-on-accent">연결이 끊겨 다시 연결하는 중이에요.</span>
        </p>
      )}
      {!loggedIn && !locked && info.status === "open" && course.status === "active" && <HelpButton lectureId={info.id} />}
      {/* 카드 상세는 닫힐 때도 원래 카드 자리로 줄어들도록, 옛 주소를 들고 빠진다 */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {cardId && (
            <Routes location={location} key={cardId}>
              <Route path="c/:cardId/*" element={<CardDetail />} />
            </Routes>
          )}
        </AnimatePresence>
      </Suspense>
    </LayoutGroup>
  );
}
