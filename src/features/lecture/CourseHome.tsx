import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { useFileUrl } from "../../lib/files";
import { formatDate, todayKst } from "../../lib/format";
import { readStore, writeStore } from "../../lib/identity";
import { spring } from "../../lib/motion";
import { useCourseData, usePrefetch } from "../../lib/queries";
import { tileColor, useCourse } from "../entry/course";
import { STATUS } from "./status";

type Lecture = { id: string; date: string; startTime: string; title: string; description: string; coverFileId: string | null; status: string; published: boolean };

function Cover({ fileId }: { fileId: string | null }) {
  const url = useFileUrl(fileId, "inline");
  return (
    <div
      aria-hidden
      className="cover-fade h-full w-full bg-cover bg-center opacity-50"
      style={{
        backgroundImage: url ? `url("${url}")` : "radial-gradient(circle at 20% 30%, var(--tile-4) 0 30%, transparent 31%), radial-gradient(circle at 75% 65%, var(--tile-1) 0 24%, transparent 25%), linear-gradient(var(--tile-5), var(--tile-5))",
      }}
    />
  );
}

function BigCard({ lecture, slug, heading }: { lecture: Lecture; slug: string; heading: string }) {
  const prefetch = usePrefetch();
  const badge = STATUS[lecture.status === "before" ? "soon" : lecture.status] ?? STATUS.closed!;
  return (
    <article className="surface relative grid grid-rows-[132px_auto] overflow-hidden rounded-hero wide:grid-cols-[minmax(160px,40%)_1fr] wide:grid-rows-none" data-testid="big-lecture">
      <Cover fileId={lecture.coverFileId} />
      <div className="flex flex-col items-start gap-1.5 p-5 sm:p-7">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted">
          <span>{heading}</span>
          <span>
            {formatDate(lecture.date)} {lecture.startTime}
          </span>
          <span className={`chip ${badge.className}`}>
            {badge.dot && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
            {badge.label}
          </span>
        </p>
        <h2 className="text-xl font-bold sm:text-2xl">{lecture.title}</h2>
        {lecture.description && <p className="text-muted">{lecture.description}</p>}
        <Link
          to={`/${encodeURIComponent(slug)}/l/${lecture.id}`}
          className="btn btn-primary mt-3 w-full sm:w-auto"
          aria-label={`${lecture.title} 들어가기`}
          onPointerDown={() => prefetch.lecture(lecture.id)}
          onMouseEnter={() => prefetch.lecture(lecture.id)}
        >
          들어가기
        </Link>
      </div>
    </article>
  );
}

function SmallCard({ lecture, slug, index }: { lecture: Lecture; slug: string; index: number }) {
  const url = useFileUrl(lecture.coverFileId, "thumb");
  const prefetch = usePrefetch();
  return (
    <Link to={`/${encodeURIComponent(slug)}/l/${lecture.id}`} className="press surface flex items-center gap-3.5 rounded-card p-3" onPointerDown={() => prefetch.lecture(lecture.id)}>
      <span className="size-14 shrink-0 rounded-[30%] bg-cover bg-center" style={url ? { backgroundImage: `url("${url}")` } : { background: tileColor(index) }} aria-hidden />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-muted">{formatDate(lecture.date)}</span>
        <span className="block truncate font-bold">{lecture.title}</span>
      </span>
    </Link>
  );
}

function Empty({ emoji, children }: { emoji: string; children: string }) {
  return (
    <div className="surface rounded-card px-6 py-10 text-center">
      <p aria-hidden className="emoji mb-3 text-5xl">
        {emoji}
      </p>
      <p className="text-muted">{children}</p>
    </div>
  );
}

/** 복습하러 오는 수강생은 지난 강의를 펼친 채로 둔다 */
const PAST_KEY = "board:show-past";

export default function CourseHome() {
  const { course } = useCourse();
  const { data } = useCourseData(course.slug);
  const reduced = useReducedMotion();
  const [showPast, setShowPastState] = useState(() => readStore(PAST_KEY) === "1");
  const setShowPast = (fn: (v: boolean) => boolean) =>
    setShowPastState((v) => {
      writeStore(PAST_KEY, fn(v) ? "1" : null);
      return fn(v);
    });
  const today = todayKst();
  const lectures: Lecture[] = data?.lectures ?? [];

  const todays = lectures
    .filter((l) => l.date === today)
    .sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || a.startTime.localeCompare(b.startTime));
  const upcoming = lectures.filter((l) => l.date > today && l.status !== "closed");
  const next = todays.length ? null : upcoming[0];
  const past = lectures
    .filter((l) => l.date < today || (l.status === "closed" && l.date !== today))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

  return (
    <main className="mx-auto max-w-[720px] space-y-4 px-[var(--gutter)] pb-16">
      <div className="pt-1 pb-2">
        <h1 className="text-2xl font-bold">{course.title}</h1>
        <p className="mt-1 text-muted">{course.instructorName} 강사님</p>
      </div>
      {todays.map((l) => (
        <BigCard key={l.id} lecture={l} slug={course.slug} heading="오늘 강의" />
      ))}
      {next && <BigCard lecture={next} slug={course.slug} heading="다가오는 강의" />}
      {!todays.length && !next && !past.length && <Empty emoji="📭">아직 공개된 강의가 없어요. 강의가 공개되면 여기에 보여요.</Empty>}
      {!todays.length && !next && past.length > 0 && <Empty emoji="🌿">오늘은 강의가 없어요. 지난 강의를 살펴볼 수 있어요.</Empty>}

      {past.length > 0 && (
        <section>
          <button className="btn btn-quiet" aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
            지난 강의 살펴보기
            <ChevronDown size={18} strokeWidth={2.25} aria-hidden className={`transition-transform duration-(--duration-base) ${showPast ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence initial={false}>
            {showPast && (
              <motion.ul
                className="mt-3 space-y-2"
                initial="hidden"
                animate="shown"
                exit="hidden"
                variants={{ hidden: { transition: { staggerChildren: reduced ? 0 : 0.03, staggerDirection: -1 } }, shown: { transition: { staggerChildren: reduced ? 0 : 0.05 } } }}
                data-testid="past-lectures"
              >
                {past.map((l, i) => (
                  <motion.li key={l.id} variants={{ hidden: { opacity: 0, y: reduced ? 0 : -8 }, shown: { opacity: 1, y: 0 } }} transition={spring}>
                    <SmallCard lecture={l} slug={course.slug} index={i} />
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      )}
    </main>
  );
}
