import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Menu } from "../../components/ui/Menu";
import type { CardDto, PostDto } from "../../lib/cache";
import { PendingCard } from "../composer/PendingCard";
import type { PendingPost } from "../composer/pending";
import { groupColor, groupSoftColor, useCourse } from "../entry/course";
import { PostCard } from "../post/PostCard";

const UNASSIGNED = "__none";

type Props = {
  card: CardDto;
  posts: PostDto[];
  pending: PendingPost[];
  sort: "newest" | "oldest" | "likes";
  setSort: (sort: "newest" | "oldest" | "likes") => void;
  canWrite: boolean;
  emptyText: string;
  onCompose: (groupId: string | null) => void;
  onEdit: (post: PostDto) => void;
};

const SORTS = { newest: "최신순", oldest: "오래된 순", likes: "좋아요 많은 순" } as const;

export function AssignmentBoard({ card, posts, pending, sort, setSort, canWrite, emptyText, onCompose, onEdit }: Props) {
  const { groups, me, instructor } = useCourse();
  const [view, setView] = useState<"columns" | "stream">("columns");
  const scroller = useRef<HTMLDivElement>(null);
  const myGroup = me?.groupId ?? null;

  const columns = useMemo(() => {
    const known = new Set(groups.map((g) => g.id));
    const hasUnassigned = groups.length === 0 || myGroup === null || posts.some((p) => !p.groupId || !known.has(p.groupId)) || pending.some((p) => !p.groupId);
    return [
      ...groups.map((g) => ({ id: g.id, name: g.name, color: groupColor(g.colorIndex), soft: groupSoftColor(g.colorIndex) })),
      ...(hasUnassigned ? [{ id: UNASSIGNED, name: groups.length ? "미지정" : "전체", color: "var(--text-muted)", soft: "var(--fill-strong)" }] : []),
    ];
  }, [groups, posts, pending, myGroup]);

  // 들어오면 내 모둠 칼럼이 보이는 위치로 자동 스크롤한다
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || view !== "columns" || !scroller.current) return;
    const target = scroller.current.querySelector<HTMLElement>(`[data-column="${myGroup ?? UNASSIGNED}"]`);
    if (target && me) {
      scroller.current.scrollLeft = target.offsetLeft - scroller.current.offsetLeft - 16;
      scrolled.current = true;
    }
  }, [view, myGroup, me, columns]);

  const inColumn = (id: string) => (p: { groupId: string | null }) => (id === UNASSIGNED ? !p.groupId || !groups.some((g) => g.id === p.groupId) : p.groupId === id);
  const canPostTo = (id: string) => instructor || (canWrite && (id === UNASSIGNED ? myGroup === null : id === myGroup));

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1100px] shrink-0 flex-wrap items-center gap-2 px-[var(--gutter)] py-2">
        <div role="group" aria-label="보기 방식" className="flex rounded-full bg-fill-strong p-1">
          {(
            [
              ["columns", "모둠별"],
              ["stream", "전체 보기"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={view === value}
              className={`min-h-11 rounded-full px-3.5 text-sm font-semibold transition-colors duration-(--duration-base) ${view === value ? "bg-surface text-ink shadow-base" : "text-muted hover:text-ink"}`}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {card.assignmentVisibility === "instructor_only" && <span className="chip bg-accent-soft text-accent-ink">{instructor ? "수강생은 자기 글만 봐요" : "강사님만 볼 수 있어요"}</span>}
        <span className="ml-auto">
          <Menu
            label={`정렬: ${SORTS[sort]}`}
            triggerClassName="press flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted hover:bg-fill-strong hover:text-ink"
            items={(Object.keys(SORTS) as Props["sort"][]).map((key) => ({ label: key === sort ? `${SORTS[key]} (지금)` : SORTS[key], onSelect: () => setSort(key) }))}
          >
            {SORTS[sort]}
            <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
          </Menu>
        </span>
      </div>

      {view === "stream" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[720px] space-y-3 px-[var(--gutter)] pb-28">
            {!posts.length && !pending.length && <p className="surface rounded-card px-6 py-10 text-center text-muted">{emptyText}</p>}
            {pending.map((p) => (
              <PendingCard key={p.id} post={p} />
            ))}
            {posts.map((p) => (
              <PostCard key={p.id} post={p} canWrite={canWrite} onEdit={onEdit} />
            ))}
          </div>
        </div>
      ) : (
        // 칼럼 머리를 위에 붙이려면 가로와 세로 스크롤이 같은 상자에 있어야 한다
        <div ref={scroller} className="relative min-h-0 flex-1 snap-x snap-mandatory overflow-auto sm:snap-none" data-testid="board">
          <div className="flex w-max min-w-full gap-3 px-[var(--gutter)] pb-28">
            {columns.map((col) => {
              const items = posts.filter(inColumn(col.id));
              const waiting = pending.filter(inColumn(col.id));
              return (
                <section key={col.id} data-column={col.id} aria-label={col.name} className="w-[calc(100vw-48px)] shrink-0 snap-center sm:w-[300px]">
                  <header className="sticky top-0 z-10 mb-3 flex min-h-13 items-center gap-2 rounded-full pr-1 pl-4" style={{ background: col.soft, color: col.color }} data-testid="column-header">
                    <h2 className="min-w-0 flex-1 truncate font-bold">{col.name}</h2>
                    <span aria-label={`글 ${items.length}개`} className="text-sm font-semibold">
                      {items.length}
                    </span>
                    {canPostTo(col.id) && (
                      <button className="press flex size-11 items-center justify-center rounded-full bg-white/60 hover:bg-white" aria-label={`${col.name}에 글쓰기`} onClick={() => onCompose(col.id === UNASSIGNED ? null : col.id)}>
                        <Plus size={20} strokeWidth={2} />
                      </button>
                    )}
                  </header>
                  <div className="space-y-3">
                    {waiting.map((p) => (
                      <PendingCard key={p.id} post={p} />
                    ))}
                    {items.map((p) => (
                      <PostCard key={p.id} post={p} canWrite={canWrite} onEdit={onEdit} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
