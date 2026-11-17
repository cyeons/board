import { ArrowLeft, Download, FileText, Heart, MessageCircle, Pencil, Plus } from "lucide-react";
import { AnimatePresence, motion, useDragControls, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { DotsMenu } from "../components/ui/Menu";
import { Modal } from "../components/ui/Modal";
import { PullToRefresh } from "../components/ui/PullToRefresh";
import { Segmented } from "../components/ui/Segmented";
import { CardListSkeleton, Skeleton } from "../components/ui/Skeleton";
import { Switch } from "../components/ui/Switch";
import { Toasts } from "../components/ui/Toasts";
import { groupSoftColor, tileColor } from "../features/entry/course";
import { haptic } from "../lib/haptics";
import { fade, pageSpring, pressable, pushSpring, rise, riseReduced } from "../lib/motion";
import { toast } from "../lib/toast";
import { pageTitle } from "../lib/brand";

const CARDS = [
  { id: "a", emoji: "👋", title: "자기소개", summary: "이름과 오늘 기대하는 점을 한 줄로 남겨 주세요", materials: 1, works: 18, due: "오늘 17:00 마감", fresh: true },
  { id: "b", emoji: "🧪", title: "프롬프트 실습", summary: "같은 질문을 세 가지 방식으로 물어보고 비교해요", materials: 3, works: 7, due: null, fresh: false },
  { id: "c", emoji: "📚", title: "수업 자료", summary: "슬라이드와 참고 링크", materials: 6, works: 0, due: null, fresh: false },
  { id: "d", emoji: "🎯", title: "모둠 과제", summary: "우리 학교에 바로 쓸 수 있는 활동 하나 설계하기", materials: 2, works: 4, due: "내일 12:00 마감", fresh: true },
];

const GROUPS = [
  { name: "1모둠", posts: [{ who: "김하늘", body: "수업 시작할 때 오늘 배울 말을 AI에게 쉬운 말로 풀어 달라고 했어요.", likes: 5, comments: 2, teacher: true }] },
  { name: "2모둠", posts: [{ who: "박서준", body: "질문을 구체적으로 바꿨더니 답이 훨씬 좋아졌어요. 예시를 넣는 게 핵심이었어요.", likes: 3, comments: 0, teacher: false }] },
  { name: "3모둠", posts: [{ who: "이수민", body: "학생 글 피드백 초안을 받아 보고, 교사 말투로 다시 다듬었어요.", likes: 8, comments: 4, teacher: false }] },
];

/**
 * 디자인 v2 견본 (plan.md 7장). 실제 화면에 적용하기 전에 휴대폰으로 만져 보고 확정하는 곳이다.
 * 개발 서버(npm run dev)에서만 열린다.
 */
export default function DesignSample() {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [pushed, setPushed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"material" | "assignment">("assignment");
  const [liked, setLiked] = useState(false);
  const [notify, setNotify] = useState(true);
  const { scrollY } = useScroll();
  const bigTitle = useTransform(scrollY, [0, 56], [1, 0]);
  const smallTitle = useTransform(scrollY, [24, 64], [0, 1]);
  const selected = CARDS.find((c) => c.id === open);

  useEffect(() => {
    document.title = pageTitle("디자인 견본");
  }, []);

  const reload = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    toast("새로 불러왔어요.");
  };

  return (
    <div className="min-h-dvh pb-32">
      <Toasts />
      {/* 위에 붙는 헤더: 스크롤하면 큰 제목이 작은 제목으로 접힌다 */}
      <header className="sticky top-0 z-30 bg-bg/85 pt-[var(--safe-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[720px] items-center gap-2 px-[var(--gutter)]">
          <button className="icon-btn -ml-2" aria-label="과정 홈으로">
            <ArrowLeft size={22} strokeWidth={2} />
          </button>
          <motion.p style={{ opacity: smallTitle }} className="min-w-0 flex-1 truncate text-md font-bold">
            생성형 AI 수업 활용
          </motion.p>
          <span className="flex size-9 items-center justify-center rounded-full text-sm font-bold" style={{ background: "var(--tile-4)" }}>
            하늘
          </span>
        </div>
      </header>

      <PullToRefresh onRefresh={reload}>
        <main className="mx-auto max-w-[720px] px-[var(--gutter)]">
          <motion.div style={{ opacity: bigTitle }} className="pt-2 pb-6">
            <p className="flex items-center gap-2 text-sm font-semibold text-muted">
              11월 3일 월요일 09:00
              <span className="chip bg-accent-soft text-accent-ink">
                <span className="size-1.5 rounded-full bg-accent" />
                진행 중
              </span>
            </p>
            <h1 className="mt-1 text-2xl font-bold">생성형 AI 수업 활용</h1>
            <p className="mt-1 text-muted">위에서 아래로 당기면 새로고침해요.</p>
          </motion.div>

          {/* 공지 */}
          <section className="mb-6 rounded-card bg-accent-soft p-5">
            <p className="flex items-center gap-2 font-bold text-accent-ink">
              <span className="emoji text-xl">📣</span>오늘 공지
            </p>
            <p className="mt-1 text-ink">노트북 충전기를 챙겨 주세요. 3교시는 모둠별로 앉아요.</p>
          </section>

          {/* 카드 스트림: Tossface 이모지 타일. 누르면 화면 가득 커지고, 닫으면 원래 자리로 줄어든다. */}
          <h2 className="mb-3 text-lg font-bold">확인할 순서</h2>
          {loading ? (
            <CardListSkeleton count={4} />
          ) : (
            <ul className="space-y-3">
              {CARDS.map((c, i) => (
                <motion.li key={c.id} initial="hidden" whileInView="shown" viewport={{ once: true }} variants={reduced ? riseReduced : rise}>
                  <motion.button
                    layoutId={reduced ? undefined : `demo-card-${c.id}`}
                    transition={pageSpring}
                    {...(reduced ? {} : pressable)}
                    onClick={() => setOpen(c.id)}
                    className="flex w-full items-center gap-4 rounded-card bg-surface p-4 text-left shadow-base"
                  >
                    <span className="tile size-14 text-[30px]" style={{ background: tileColor(i) }}>
                      {c.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-md font-bold">{c.title}</span>
                        {c.fresh && <span aria-label="새 글" className="size-2 shrink-0 rounded-full bg-accent" />}
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-sm text-muted">{c.summary}</span>
                      <span className="mt-2 flex items-center gap-3 text-xs font-medium text-muted">
                        <span className="flex items-center gap-1">
                          <FileText size={14} strokeWidth={2} />
                          {c.materials}
                        </span>
                        <span className="flex items-center gap-1">
                          <Pencil size={14} strokeWidth={2} />
                          {c.works}
                        </span>
                        {c.due && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">{c.due}</span>}
                      </span>
                    </span>
                  </motion.button>
                </motion.li>
              ))}
            </ul>
          )}

          {/* 버튼 */}
          <h2 className="mt-10 mb-3 text-lg font-bold">버튼</h2>
          <div className="space-y-3 rounded-card bg-surface p-5 shadow-base">
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => haptic()}>
                게시
              </button>
              <button className="btn btn-ghost">링크 복사</button>
              <button className="btn btn-quiet">취소</button>
              <button className="btn btn-danger">삭제</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn btn-primary"
                aria-busy={busy}
                onClick={() => {
                  setBusy(true);
                  setTimeout(() => {
                    setBusy(false);
                    toast("게시했어요.");
                  }, 1500);
                }}
              >
                눌러서 보내기
              </button>
              <button className="btn btn-primary" disabled>
                쓸 수 없음
              </button>
              <button className="btn btn-ghost btn-sm">작은 버튼</button>
            </div>
            <input className="field" placeholder="댓글 추가" aria-label="입력칸 견본" />
            <div className="flex items-center justify-between">
              <Switch checked={notify} onCheckedChange={setNotify} label="알림음" showLabel />
              <Segmented
                label="자료와 과제"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "material", label: "자료" },
                  { value: "assignment", label: "과제" },
                ]}
              />
            </div>
          </div>

          {/* 과제 칼럼: 흰 게시물 카드, 모둠 색은 칼럼 머리에만 */}
          <h2 className="mt-10 mb-3 text-lg font-bold">과제 칼럼</h2>
          <div className="-mx-[var(--gutter)] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[var(--gutter)] pb-2">
            {GROUPS.map((g, i) => (
              <div key={g.name} className="w-[280px] shrink-0 snap-start">
                <div className="mb-2 flex items-center justify-between rounded-full px-4 py-2" style={{ background: groupSoftColor(i), color: `var(--group-${i + 1})` }}>
                  <span className="font-bold">{g.name}</span>
                  <span className="text-sm font-semibold">{g.posts.length}</span>
                </div>
                {g.posts.map((p) => (
                  <article key={p.who} className="rounded-post bg-surface p-4 shadow-base">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-full text-xs font-bold" style={{ background: tileColor(i + 2) }}>
                        {p.who.slice(1)}
                      </span>
                      <span className="text-sm font-semibold">{p.who}</span>
                      <span className="text-xs text-faint">3분 전</span>
                      <span className="ml-auto">
                        <DotsMenu items={[{ label: "고치기", onSelect: () => toast("고치기") }, { label: "지우기", onSelect: () => toast("지웠어요."), danger: true }]} />
                      </span>
                    </div>
                    <p className="mt-2">{p.body}</p>
                    <div className="mt-3 flex items-center gap-4 text-sm font-medium text-muted">
                      <motion.button
                        whileTap={reduced ? undefined : { scale: 0.85 }}
                        onClick={() => {
                          setLiked((v) => !v);
                          haptic();
                        }}
                        className={`flex min-h-9 items-center gap-1 ${liked ? "text-danger" : ""}`}
                        aria-pressed={liked}
                      >
                        <motion.span key={String(liked)} initial={reduced || !liked ? false : { scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 14 }}>
                          <Heart size={18} strokeWidth={2} fill={liked ? "currentColor" : "none"} />
                        </motion.span>
                        {p.likes + (liked ? 1 : 0)}
                        {p.teacher && <span className="chip ml-1 bg-accent-soft px-2 py-0 text-xs text-accent-ink">강사</span>}
                      </motion.button>
                      <span className="flex items-center gap-1">
                        <MessageCircle size={18} strokeWidth={2} />
                        {p.comments}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>

          {/* 불러오는 동안 */}
          <h2 className="mt-10 mb-3 text-lg font-bold">불러오는 동안</h2>
          <div className="space-y-3 rounded-card bg-surface p-5 shadow-base">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/5" />
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
          </div>

          {/* 시트, 화면 이동, 알림 */}
          <h2 className="mt-10 mb-3 text-lg font-bold">시트와 화면 이동</h2>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn btn-ghost" onClick={() => setSheet(true)}>
              시트 열기
            </button>
            <button className="btn btn-ghost" onClick={() => setPushed(true)}>
              옆 화면 열기
            </button>
            <button className="btn btn-quiet" onClick={() => toast("강사님이 내 글에 댓글을 달았어요.")}>
              알림 띄우기
            </button>
            <button className="btn btn-quiet" onClick={() => toast("지웠어요.", { action: { label: "실행 취소", run: () => toast("되살렸어요.") } })}>
              실행 취소 알림
            </button>
          </div>
        </main>
      </PullToRefresh>

      {/* 오른쪽 아래 글쓰기 버튼 */}
      <motion.button
        {...(reduced ? {} : pressable)}
        onClick={() => setSheet(true)}
        className="fixed right-[var(--gutter)] bottom-[calc(20px+var(--safe-bottom))] z-20 flex h-14 items-center gap-2 rounded-full bg-accent pr-6 pl-5 font-bold text-on-accent shadow-raised"
      >
        <Plus size={22} strokeWidth={2.5} />
        글쓰기
      </motion.button>

      {/* 카드 상세: 누른 카드가 화면 가득 커진다 */}
      <AnimatePresence>
        {selected && (
          <motion.div
            layoutId={reduced ? undefined : `demo-card-${selected.id}`}
            transition={reduced ? fade : pageSpring}
            initial={reduced ? { opacity: 0 } : undefined}
            animate={reduced ? { opacity: 1 } : undefined}
            exit={reduced ? { opacity: 0 } : undefined}
            className="fixed inset-0 z-40 overflow-y-auto bg-bg"
          >
            <div className="sticky top-0 z-10 bg-surface pt-[var(--safe-top)]">
              <div className="mx-auto flex h-14 max-w-[720px] items-center gap-3 px-[var(--gutter)]">
                <button className="icon-btn -ml-2" aria-label="닫기" onClick={() => setOpen(null)}>
                  <ArrowLeft size={22} strokeWidth={2} />
                </button>
                <span className="emoji text-2xl">{selected.emoji}</span>
                <p className="min-w-0 flex-1 truncate text-md font-bold">{selected.title}</p>
                <button className="icon-btn" aria-label="전체 내려받기">
                  <Download size={20} strokeWidth={2} />
                </button>
              </div>
              <div className="mx-auto max-w-[720px] px-[var(--gutter)] pb-3">
                <Segmented
                  label="자료와 과제"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "material", label: `자료 ${selected.materials}` },
                    { value: "assignment", label: `과제 ${selected.works}` },
                  ]}
                />
              </div>
            </div>
            <div className="mx-auto max-w-[720px] space-y-3 p-[var(--gutter)]">
              <p className="text-muted">{selected.summary}</p>
              {[1, 2, 3].map((n) => (
                <div key={n} className="rounded-post bg-surface p-4 shadow-base">
                  <Skeleton className="mb-3 h-4 w-1/3" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PushedPage open={pushed} onClose={() => setPushed(false)} />

      <Modal
        open={sheet}
        onOpenChange={setSheet}
        title="글쓰기"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setSheet(false)}>
            게시
          </button>
        }
      >
        <div className="space-y-3">
          <input className="field text-md font-semibold" placeholder="제목 (선택)" aria-label="제목" />
          <textarea className="field min-h-32" placeholder="휴대폰에서는 손잡이를 끌어내리면 닫혀요." aria-label="본문" />
          <div className="flex gap-2">
            {["🖼️ 사진", "📎 파일", "🔗 링크", "📷 카메라"].map((t) => (
              <button key={t} className="btn btn-quiet btn-sm">
                <span className="emoji">{t.split(" ")[0]}</span>
                {t.split(" ")[1]}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** iOS식으로 옆에서 밀려 들어오는 화면. 왼쪽 끝을 오른쪽으로 쓸면 닫힌다. */
function PushedPage({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduced = useReducedMotion();
  const drag = useDragControls();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { x: "100%" }}
          animate={reduced ? { opacity: 1 } : { x: 0 }}
          exit={reduced ? { opacity: 0 } : { x: "100%" }}
          transition={reduced ? fade : pushSpring}
          drag={reduced ? false : "x"}
          dragControls={drag}
          dragListener={false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 1 }}
          onDragEnd={(_, info) => {
            if (info.offset.x > 100 || info.velocity.x > 500) onClose();
          }}
          onPointerDown={(e) => {
            if (e.clientX < 28) drag.start(e);
          }}
          className="fixed inset-0 z-40 overflow-y-auto bg-bg shadow-raised"
          style={{ touchAction: "pan-y" }}
        >
          <div className="sticky top-0 bg-bg/85 pt-[var(--safe-top)] backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-[720px] items-center px-[var(--gutter)]">
              <button className="icon-btn -ml-2" aria-label="뒤로" onClick={onClose}>
                <ArrowLeft size={22} strokeWidth={2} />
              </button>
            </div>
          </div>
          <div className="mx-auto max-w-[720px] px-[var(--gutter)]">
            <h1 className="text-2xl font-bold">옆에서 들어온 화면</h1>
            <p className="mt-2 text-muted">과정 홈에서 강의로 들어갈 때 이렇게 움직여요. 화면 왼쪽 끝을 오른쪽으로 쓸면 뒤로 가요.</p>
            <div className="mt-6">
              <CardListSkeleton count={3} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
