import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, MonitorPlay, Plus } from "lucide-react";
import { motion, useDragControls, useReducedMotion } from "motion/react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Route, Routes, useNavigate, useParams, useSearchParams } from "react-router";
import { FabLabel } from "../../components/ui/FabLabel";
import { Segmented } from "../../components/ui/Segmented";
import { PostListSkeleton } from "../../components/ui/Skeleton";
import { ApiFailure, api, errorText, unwrap } from "../../lib/api";
import { type PostDto, sortPosts } from "../../lib/cache";
import { useFileDrop } from "../../lib/drop";
import { useCollapseOnScroll, useFabCollapsed } from "../../lib/fab";
import { useDialogFocus } from "../../lib/focus";
import { fileUrl } from "../../lib/files";
import { DUE_CHIP, dueLabel, dueTone } from "../../lib/format";
import { fade, pageFade, pageOpen, pressable } from "../../lib/motion";
import { postsOptions, useLecture } from "../../lib/queries";
import { markSeen } from "../../lib/seen";
import { toast, toastError } from "../../lib/toast";
import { Composer } from "../composer/Composer";
import { PendingCard } from "../composer/PendingCard";
import { usePendingPosts } from "../composer/pending";
import { useCourse } from "../entry/course";
import { PostCard } from "../post/PostCard";
import { ZIP_LIMIT, saveBlob, zipFiles } from "../post/zip";
import { AssignmentBoard } from "./AssignmentBoard";
import { pageTitle } from "../../lib/brand";

const MaterialSort = lazy(() => import("./MaterialSort"));
const Present = lazy(() => import("../present/Present"));
const PostOverlay = lazy(() => import("../post/PostOverlay"));

type ComposerState = { groupId: string | null; files?: File[]; text?: string; editing?: PostDto } | null;

const FULL_CLIP = "inset(0px 0px 0px 0px round 0px)";

/** 목록에 보이는 카드의 자리를 상세 화면 기준의 clip-path로. 목록에 없거나 화면 밖이면 null */
function cardClip(cardId: string): string | null {
  const el = document.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.bottom <= 0 || r.top >= window.innerHeight) return null;
  const panel = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--panel-width")) || 0;
  const right = window.innerWidth - panel - r.right;
  return `inset(${r.top}px ${right}px ${window.innerHeight - r.bottom}px ${r.left}px round 24px)`;
}

export default function CardDetail() {
  const { lectureId = "", cardId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [from] = useState(() => cardClip(cardId));
  const drag = useDragControls();
  const { course, instructor, me, studentView } = useCourse();

  const { data: lecture } = useLecture(lectureId);
  const fromList = lecture?.cards.find((c) => c.id === cardId);
  const direct = useQuery({
    queryKey: ["card", cardId],
    enabled: !fromList,
    queryFn: () => unwrap(api.cards[":id"].$get({ param: { id: cardId } })),
  });
  const card = fromList ?? direct.data?.card;
  const wasListed = useRef(false);
  if (fromList) wasListed.current = true;

  const requestedTab = params.get("tab") === "assignment" ? "assignment" : "material";
  const tab: "material" | "assignment" = card?.hasAssignment ? requestedTab : "material";
  const [sort, setSort] = useState<"newest" | "oldest" | "likes">("newest");
  const [composer, setComposer] = useState<ComposerState>(null);
  const lastComposer = useRef<Exclude<ComposerState, null> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useDialogFocus(root);
  useCollapseOnScroll(root);
  const fabCollapsed = useFabCollapsed();
  if (composer) lastComposer.current = composer;
  const [presenting, setPresenting] = useState(false);
  const [zipping, setZipping] = useState("");

  const posts = useQuery({ ...postsOptions(cardId, tab, sort), enabled: Boolean(card) });
  const pending = usePendingPosts(cardId, tab);
  const list = useMemo(() => sortPosts(posts.data?.posts ?? [], tab, sort), [posts.data, tab, sort]);

  const status = lecture?.lecture.status;
  // 수강생으로 보기는 보기만 한다. 서버는 강사 쿠키로 받으므로 쓰면 강사 이름으로 올라간다
  const canWrite = !studentView && (instructor || (status === "open" && course.status === "active"));
  const canPostHere = instructor || (tab === "assignment" && canWrite);
  const myGroup = me?.groupId ?? null;

  const close = useCallback(() => void navigate(`/${encodeURIComponent(course.slug)}/l/${lectureId}`), [navigate, course.slug, lectureId]);

  useEffect(() => {
    markSeen(cardId);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role=dialog]:not([data-card-detail])")) close();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      markSeen(cardId);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [cardId, close]);

  useEffect(() => {
    if (card) document.title = pageTitle(card.title);
  }, [card]);

  // 보는 중에 강사가 카드를 숨기거나 지우면, 주소 오류 대신 알리고 강의로 돌아간다
  useEffect(() => {
    if (wasListed.current && lecture && !fromList) {
      toast("강사님이 이 카드를 닫았어요.");
      close();
    }
  }, [lecture, fromList, close]);

  const openComposer = useCallback(
    (state: Exclude<ComposerState, null>) => {
      if (!canPostHere) return;
      setComposer(state);
    },
    [canPostHere],
  );

  // 파일을 끌어다 놓거나 붙여넣으면 글쓰기 창이 열린다 (plan.md 5.5)
  const { dragging: dragOver, dropProps } = useFileDrop(canPostHere ? (files) => openComposer({ groupId: myGroup, files }) : undefined);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (document.querySelector("[role=dialog]:not([data-card-detail])")) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea")) return;
      const files = [...(e.clipboardData?.files ?? [])];
      const text = e.clipboardData?.getData("text")?.trim();
      if (files.length) openComposer({ groupId: myGroup, files });
      else if (text) openComposer({ groupId: myGroup, text });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [openComposer, myGroup]);

  async function downloadAll() {
    const items = (posts.data?.posts ?? []).flatMap((p) => p.attachments.filter((a) => a.fileId && a.file).map((a) => ({ name: a.file!.filename, size: a.file!.size, url: () => fileUrl(a.fileId!, "download") })));
    if (!items.length) return toast("내려받을 파일이 없어요.");
    if (items.reduce((s, i) => s + i.size, 0) > ZIP_LIMIT) return toast("파일이 많아서 강의별 백업이나 개별 다운로드를 권해요.", { tone: "error" });
    setZipping("0");
    try {
      const blob = await zipFiles(items, (done, total) => setZipping(`${done}/${total}`));
      saveBlob(blob, `${card?.title ?? "자료"}.zip`);
    } catch (e) {
      toastError(e);
    } finally {
      setZipping("");
    }
  }

  if (!card && direct.isError) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg p-4">
        <div className="surface max-w-[420px] rounded-card p-6 text-center">
          <p role="alert" className="mb-4">
            {direct.error instanceof ApiFailure && direct.error.status === 404 ? "이 카드는 지금 볼 수 없어요. 강사님이 공개하면 다시 열려요." : errorText(direct.error)}
          </p>
          <button className="btn btn-ghost" onClick={close}>
            강의로 돌아가기
          </button>
        </div>
      </div>
    );
  }
  if (!card) return null;

  const emptyText = tab === "material" ? (instructor ? "자료를 올려 보세요." : "아직 자료가 없어요.") : canWrite ? "첫 글을 올려 보세요." : "아직 올라온 글이 없어요.";

  return (
    <motion.div
      // 누른 카드 자리에서 창이 열리듯 넓어지고, 닫으면 그 카드로 다시 접힌다 (LecturePage의 AnimatePresence).
      // 크기를 늘리지 않고 보이는 영역(clip-path)만 넓혀서 글자가 늘어나지 않는다. 카드 자리를 모르면 제자리에서 살짝 커진다
      {...(reduced
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade }
        : from
          ? { variants: { card: { clipPath: from, transition: pageOpen }, full: { clipPath: FULL_CLIP, transition: pageOpen } }, initial: "card", animate: "full", exit: "card" }
          : { initial: { opacity: 0, scale: 0.98 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.98 }, transition: pageFade })}
      drag={reduced ? false : "y"}
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.6 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 120) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={card.title}
      data-card-detail
      ref={root}
      tabIndex={-1}
      style={{ right: "var(--panel-width, 0px)" }}
      className={`fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden bg-bg outline-none ${dragOver ? "outline-4 -outline-offset-4 outline-accent" : ""}`}
      {...dropProps}
    >
      {/* 카드와 같은 흰 바탕에서 시작해 내용으로 바뀌고, 닫을 때는 다시 흰 카드가 되어 원래 카드와 겹친다 */}
      {from && !reduced && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-50 bg-surface"
          variants={{ card: { opacity: 1, transition: { duration: 0.2, delay: 0.1 } }, full: { opacity: 0, transition: { duration: 0.28, delay: 0.06 } } }}
        />
      )}
      <header className="shrink-0 bg-surface pt-[var(--safe-top)] shadow-[0_1px_0_var(--border)]" onPointerDown={(e) => { if (!(e.target as HTMLElement).closest("button, a, select")) drag.start(e); }} style={{ touchAction: "none" }}>
        <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-fill-strong sm:hidden" />
        <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-[var(--gutter)] py-2.5">
          <button className="icon-btn -ml-2.5" aria-label="닫기" onClick={close}>
            <ArrowLeft size={24} strokeWidth={2} />
          </button>
          <span aria-hidden className="emoji text-[28px]">
            {card.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-md font-bold">{card.title}</h1>
            {card.summary && <p className="truncate text-sm text-muted">{card.summary}</p>}
          </div>
          {card.assignmentDueAt && tab === "assignment" && <span className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:block ${DUE_CHIP[dueTone(card.assignmentDueAt)]}`}>{dueLabel(card.assignmentDueAt)}</span>}
          {instructor && list.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setPresenting(true)}>
              <MonitorPlay size={18} strokeWidth={2} />
              발표
            </button>
          )}
        </div>
        {card.hasAssignment && (
          <div className="mx-auto max-w-[1100px] px-[var(--gutter)] pb-3">
            <Segmented
              label="자료와 과제"
              value={tab}
              onChange={(name) => setParams({ tab: name }, { replace: true })}
              options={[
                { value: "material", label: "자료" },
                { value: "assignment", label: "과제" },
              ]}
            />
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {posts.isError && (
          <p role="alert" className="p-6">
            {errorText(posts.error)}
          </p>
        )}
        {tab === "material" ? (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[720px] space-y-3 px-[var(--gutter)] py-4 pb-28">
              {list.some((p) => p.attachments.some((a) => a.fileId)) && (
                <button className="btn btn-ghost btn-sm" disabled={Boolean(zipping)} onClick={() => void downloadAll()}>
                  <Download size={18} strokeWidth={2} />
                  {zipping ? `묶는 중 ${zipping}` : "전체 내려받기"}
                </button>
              )}
              {posts.isPending && <PostListSkeleton />}
              {posts.isSuccess && !list.length && !pending.length && (
                <div className="surface rounded-card px-6 py-10 text-center">
                  <p aria-hidden className="emoji mb-3 text-5xl">
                    {canPostHere ? "✏️" : "📂"}
                  </p>
                  <p className="text-muted">{emptyText}</p>
                </div>
              )}
              {instructor && list.length > 1 ? (
                <Suspense fallback={null}>
                  <MaterialSort posts={list} canWrite={canWrite} onEdit={(post) => setComposer({ groupId: null, editing: post })} />
                </Suspense>
              ) : (
                list.map((p) => <PostCard key={p.id} post={p} canWrite={canWrite} onEdit={(post) => setComposer({ groupId: null, editing: post })} />)
              )}
              {pending.map((p) => (
                <PendingCard key={p.id} post={p} />
              ))}
            </div>
          </div>
        ) : (
          <AssignmentBoard
            card={card}
            posts={list}
            pending={pending}
            sort={sort}
            setSort={setSort}
            canWrite={canWrite}
            emptyText={emptyText}
            onCompose={(groupId) => openComposer({ groupId })}
            onEdit={(post) => setComposer({ groupId: post.groupId, editing: post })}
          />
        )}
      </div>

      {canPostHere && (
        <motion.button
          {...(reduced ? {} : pressable)}
          className={`fixed right-[max(var(--gutter),env(safe-area-inset-right))] bottom-[calc(20px+var(--safe-bottom))] z-30 flex h-14 items-center rounded-full bg-accent px-[17px] font-bold text-on-accent shadow-raised transition-[gap] duration-(--duration-base) ${fabCollapsed ? "gap-0" : "gap-1.5"}`}
          aria-label={tab === "material" ? "자료 쓰기" : "글쓰기"}
          onClick={() => openComposer({ groupId: myGroup })}
        >
          <Plus size={22} strokeWidth={2.5} aria-hidden />
          <FabLabel collapsed={fabCollapsed}>{tab === "material" ? "자료 쓰기" : "글쓰기"}</FabLabel>
        </motion.button>
      )}

      {/* 닫힐 때도 시트가 내려가며 사라지도록, 한 번 연 글쓰기 창은 마지막 내용을 들고 계속 둔다 */}
      {lastComposer.current && (
        <Composer
          open={composer !== null}
          onOpenChange={(v) => !v && setComposer(null)}
          cardId={cardId}
          lectureId={lectureId}
          tab={tab}
          groupId={lastComposer.current.groupId}
          editing={lastComposer.current.editing}
          seedFiles={lastComposer.current.files}
          seedText={lastComposer.current.text}
          dueAt={card.assignmentDueAt}
        />
      )}
      {presenting && (
        <Suspense fallback={null}>
          <Present posts={list} title={card.title} onClose={() => setPresenting(false)} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <Routes>
          <Route path="p/:postId" element={<PostOverlay />} />
        </Routes>
      </Suspense>
    </motion.div>
  );
}
