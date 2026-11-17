import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence, motion, useScroll, useTransform } from "motion/react";
import { type FormEvent, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
import { Page } from "../../components/ui/Page";
import { PullToRefresh } from "../../components/ui/PullToRefresh";
import { CardListSkeleton, PageSkeleton } from "../../components/ui/Skeleton";
import { Toasts } from "../../components/ui/Toasts";
import { ApiFailure, api, errorText, unwrap } from "../../lib/api";
import { lectureOptions, useCourseData } from "../../lib/queries";
import { clearToken, hasToken, lastNickname, rememberCourse, saveNickname, saveToken, setActiveCourse } from "../../lib/identity";
import { useAdminMe } from "../admin/AdminFrame";
import { HelpPanelSlot } from "../help/slot";
import { NameChip } from "./NameChip";
import { CourseContext, type CourseCtx, type Group, type Me } from "./course";
import { APP_NAME, HOME_URL, pageTitle } from "../../lib/brand";

const CourseHome = lazy(() => import("../lecture/CourseHome"));
const LecturePage = lazy(() => import("../lecture/LecturePage"));

/** 과정 홈은 깊이 0, 강의는 깊이 1. 들어가면 오른쪽에서, 돌아오면 왼쪽에서 화면이 들어온다. */
const depthOf = (key: string) => (key === "home" ? 0 : 1);

/**
 * 과정 안의 화면 이동. 나가는 화면은 옛 주소를 그대로 들고 움직이며 빠지고(Routes의 location),
 * 다 빠진 뒤 새 화면이 들어온다. 화면마다 스크롤 위치를 기억했다가 돌아오면 되돌린다.
 */
function CourseRoutes({ slug }: { slug: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const key = location.pathname.match(/\/l\/([^/]+)/)?.[1] ?? "home";
  const prev = useRef(key);
  const scrolls = useRef(new Map<string, number>());
  const dir = key === prev.current ? 0 : depthOf(key) >= depthOf(prev.current) ? 1 : -1;

  useLayoutEffect(() => {
    if (key === prev.current) return;
    scrolls.current.set(prev.current, window.scrollY);
    prev.current = key;
  }, [key]);

  return (
    <Suspense fallback={<div className="mx-auto max-w-[720px] px-[var(--gutter)]"><CardListSkeleton /></div>}>
      <AnimatePresence mode="wait" initial={false} custom={dir} onExitComplete={() => window.scrollTo(0, scrolls.current.get(key) ?? 0)}>
        <Routes location={location} key={key}>
          <Route index element={<Page><CourseHome /></Page>} />
          <Route path="l/:lectureId/*" element={<Page onBack={() => void navigate(`/${encodeURIComponent(slug)}`)}><LecturePage /></Page>} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
}

/**
 * 위에 붙는 헤더. 강의 화면에서는 뒤로 가기 버튼이 생기고, 큰 제목이 스크롤로 사라지면 작은 제목이 나타난다.
 */
function CourseHeader({ slug, title }: { slug: string; title: string }) {
  const location = useLocation();
  const lectureId = location.pathname.match(/\/l\/([^/]+)/)?.[1];
  const lecture = useQuery({ ...lectureOptions(lectureId ?? ""), enabled: Boolean(lectureId) });
  const { scrollY } = useScroll();
  const smallTitle = useTransform(scrollY, [40, 96], [0, 1]);
  return (
    <header className="sticky top-0 z-30 bg-bg/85 pt-[var(--safe-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[720px] items-center gap-2 px-[var(--gutter)]">
        {lectureId ? (
          <Link to={`/${encodeURIComponent(slug)}`} className="icon-btn -ml-2.5" aria-label="과정 홈">
            <ArrowLeft size={24} strokeWidth={2} />
          </Link>
        ) : (
          <a href={HOME_URL ?? import.meta.env.BASE_URL} className="press text-md font-extrabold tracking-tight text-accent-ink" aria-label={`${APP_NAME} 홈으로`}>
            {APP_NAME}
          </a>
        )}
        <motion.p style={{ opacity: smallTitle }} aria-hidden className="min-w-0 flex-1 truncate text-md font-bold">
          {lectureId ? lecture.data?.lecture.title : title}
        </motion.p>
        <NameChip />
      </div>
    </header>
  );
}

function EntryCard({ title, instructorName, slug, groups, onJoined }: { title: string; instructorName: string; slug: string; groups: Group[]; onJoined: (me: Me) => void }) {
  const [nickname, setNickname] = useState(lastNickname());
  const [groupId, setGroupId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await unwrap(api.courses[":slug"].join.$post({ param: { slug }, json: { nickname, groupId } }));
      saveToken(res.participant.courseId, res.token);
      saveNickname(res.participant.nickname);
      onJoined(res.participant);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="enter-zoom surface w-full max-w-[420px] space-y-6 rounded-hero p-6 sm:p-8">
        <div>
          <p aria-hidden className="emoji mb-4 text-5xl">
            👋
          </p>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-muted">{instructorName} 강사님의 과정이에요. 닉네임을 정하고 들어와요.</p>
        </div>
        <div>
          <label htmlFor="nickname" className="mb-1.5 block text-sm font-semibold">
            닉네임
          </label>
          <input id="nickname" className="field" required minLength={2} maxLength={12} autoComplete="off" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="2자에서 12자로 적어 주세요" />
        </div>
        {groups.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">
              모둠 <span className="font-normal text-muted">(선택, 나중에 바꿀 수 있어요)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <label key={g.id} className={`btn btn-sm ${groupId === g.id ? "btn-primary" : "btn-quiet"} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent`}>
                  <input type="radio" name="group" className="sr-only" checked={groupId === g.id} onChange={() => setGroupId(g.id)} />
                  {g.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" aria-busy={busy}>
          입장하기
        </button>
      </form>
    </main>
  );
}

export default function CourseShell() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const adminMe = useAdminMe();
  const loggedIn = Boolean(adminMe.data?.instructor);
  const [studentView, setStudentView] = useState(false);
  const [me, setMeState] = useState<Me | null>(null);
  const [identityChecked, setIdentityChecked] = useState(false);

  const courseQuery = useCourseData(slug);
  const data = courseQuery.data;
  const courseId = data?.course.id;

  // 요청의 Authorization 헤더가 이 과정의 토큰을 쓰도록 먼저 맞춘다
  if (courseId) setActiveCourse(courseId);

  // 이름을 바꾼 과정의 옛 주소로 들어오면 새 주소로 넘긴다
  useEffect(() => {
    if (data?.redirectTo) {
      const rest = location.pathname.split("/").slice(2).join("/");
      void navigate(`/${encodeURIComponent(data.redirectTo)}${rest ? `/${rest}` : ""}${location.search}`, { replace: true });
    }
  }, [data?.redirectTo, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (data && !data.redirectTo) {
      rememberCourse({ slug: data.course.slug, title: data.course.title });
      document.title = pageTitle(data.course.title);
    }
  }, [data]);

  // 신원 확인: 저장된 토큰, 그다음 복구 쿠키, 둘 다 없으면 첫 입장 카드
  useEffect(() => {
    if (!courseId || adminMe.isLoading) return;
    let alive = true;
    setIdentityChecked(false);
    void (async () => {
      let found: Me | null = null;
      if (hasToken(courseId)) {
        try {
          found = (await unwrap(api.me.$get())).participant;
        } catch (e) {
          if (e instanceof ApiFailure && e.status >= 400 && e.status < 500) clearToken(courseId);
        }
      }
      if (!found) {
        try {
          const restored = await unwrap(api.courses[":slug"].restore.$post({ param: { slug } }));
          saveToken(courseId, restored.token);
          found = restored.participant;
        } catch {
          // 복구할 신원이 없으면 입장 카드를 보여 준다
        }
      }
      if (alive) {
        setMeState(found);
        setIdentityChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [courseId, slug, adminMe.isLoading]);

  const setMe = useCallback(
    (next: Me | null) => {
      setMeState(next);
      if (next) saveNickname(next.nickname);
      void qc.invalidateQueries({ queryKey: ["lecture"] });
      void qc.invalidateQueries({ queryKey: ["posts"] });
    },
    [qc],
  );

  // 강사가 내 모둠을 지우면 서버는 모둠을 비운다. 화면의 내 모둠도 맞춘다
  useEffect(() => {
    if (me?.groupId && data && !data.groups.some((g) => g.id === me.groupId)) setMe({ ...me, groupId: null });
  }, [data, me, setMe]);

  const ctx = useMemo<CourseCtx | null>(
    () =>
      data
        ? {
            course: data.course,
            groups: data.groups,
            me,
            setMe,
            loggedIn,
            instructor: loggedIn && !studentView,
            studentView,
            setStudentView,
          }
        : null,
    [data, me, setMe, loggedIn, studentView],
  );

  if (courseQuery.isError) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <div className="surface max-w-[420px] rounded-card p-6 text-center">
          <p role="alert" className="mb-4">
            {errorText(courseQuery.error)}
          </p>
          <Link to="/" className="btn btn-ghost">
            안내 화면으로 가기
          </Link>
        </div>
      </main>
    );
  }
  if (!ctx || !identityChecked || adminMe.isLoading || data?.redirectTo) return <PageSkeleton />;

  if (!loggedIn && !me) {
    return (
      <>
        <Toasts />
        <EntryCard title={ctx.course.title} instructorName={ctx.course.instructorName} slug={slug} groups={ctx.groups} onJoined={setMe} />
      </>
    );
  }

  return (
    <CourseContext.Provider value={ctx}>
      <Toasts />
      <div className="min-h-dvh pr-[var(--panel-width,0px)] transition-[padding] duration-(--duration-base)">
        <div className="min-w-0">
          <CourseHeader slug={ctx.course.slug} title={ctx.course.title} />
          <PullToRefresh onRefresh={() => qc.invalidateQueries({ type: "active" })}>
            <CourseRoutes slug={ctx.course.slug} />
          </PullToRefresh>
        </div>
        <HelpPanelSlot />
      </div>
    </CourseContext.Provider>
  );
}
