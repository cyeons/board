import { Check, FileText, Pencil } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Suspense, lazy } from "react";
import { useNavigate } from "react-router";
import { CardListSkeleton } from "../../components/ui/Skeleton";
import type { CardDto } from "../../lib/cache";
import { isMobileDevice } from "../../lib/device";
import { DUE_CHIP, dueLabel, dueTone } from "../../lib/format";
import { hoverLift, rise, riseReduced } from "../../lib/motion";
import { usePrefetch } from "../../lib/queries";
import { lastSeen } from "../../lib/seen";
import { tileColor, useCourse } from "../entry/course";

const EditStream = lazy(() => import("./EditStream"));

/** 카드 사이에 새 카드를 끼워 넣어도 다른 카드 색이 바뀌지 않도록 ID로 색을 고른다 */
const tileOf = (id: string) => tileColor([...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0));

/**
 * 카드 한 장: 연한 색 타일 위 이모지, 제목, 한 줄 설명, 자료와 과제 개수.
 * memo로 감싸지 않는다. 새 글 점은 localStorage(lastSeen)를 읽으므로, 상세를 보고 나오면 다시 그려야 꺼진다.
 */
export function CardFace({ card }: { card: CardDto }) {
  const isNew = card.lastPostAt !== null && card.lastPostAt > lastSeen(card.id);
  return (
    <div className="flex items-center gap-4 p-4">
      <span aria-hidden className="tile size-14 text-[30px]" style={{ background: tileOf(card.id) }}>
        {card.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 truncate text-md font-bold">{card.title}</h2>
          {isNew && <span className="size-2 shrink-0 rounded-full bg-accent" role="img" aria-label="새 글이 있어요" />}
        </div>
        {card.summary && <p className="mt-0.5 truncate text-sm text-muted">{card.summary}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium text-muted">
          <span className="inline-flex items-center gap-1" aria-label={`자료 ${card.materialCount}개`}>
            <FileText size={14} strokeWidth={2} aria-hidden />
            {card.materialCount}
          </span>
          {card.hasAssignment && (
            <span className="inline-flex items-center gap-1" aria-label={`과제 ${card.assignmentCount}개`}>
              <Pencil size={14} strokeWidth={2} aria-hidden />
              {card.assignmentCount}
            </span>
          )}
          {card.hasAssignment && card.submitted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent-ink">
              <Check size={14} strokeWidth={2.5} aria-hidden />
              제출함
            </span>
          )}
          {card.assignmentDueAt && !card.submitted && <span className={`rounded-full px-2 py-0.5 ${DUE_CHIP[dueTone(card.assignmentDueAt)]}`}>{dueLabel(card.assignmentDueAt)}</span>}
        </div>
      </div>
    </div>
  );
}

export function Stream({ lectureId, cards, editing }: { lectureId: string; cards: CardDto[]; editing: boolean }) {
  const { course, instructor } = useCourse();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const prefetch = usePrefetch();

  if (editing) {
    return (
      <Suspense fallback={<CardListSkeleton count={cards.length || 3} />}>
        <EditStream lectureId={lectureId} cards={cards} />
      </Suspense>
    );
  }

  if (!cards.length) {
    const hint = isMobileDevice() ? "컴퓨터에서 편집을 켜고 첫 카드를 만들어 보세요." : "아래 도구 막대에서 편집을 켜고 첫 카드를 만들어 보세요.";
    return <p className="surface rounded-card p-8 text-center text-muted">{instructor ? hint : "아직 공개된 카드가 없어요. 곧 강사님이 공개할 거예요."}</p>;
  }

  return (
    <ul className="space-y-3" data-testid="card-stream">
      <AnimatePresence initial={false}>
        {cards.map((card) => (
          <motion.li key={card.id} layout={!reduced} exit={{ opacity: 0 }}>
            <motion.div
              data-card-id={card.id}
              initial="hidden"
              whileInView="shown"
              viewport={{ once: true, margin: "0px 0px -24px 0px" }}
              variants={reduced ? riseReduced : rise}
              className="surface overflow-hidden rounded-card"
            >
              <motion.button
                {...(reduced ? {} : hoverLift)}
                className="block w-full text-left"
                aria-label={`${card.title} 열기`}
                onPointerDown={() => prefetch.card(card.id)}
                onClick={() => void navigate(`/${encodeURIComponent(course.slug)}/l/${lectureId}/c/${card.id}`)}
              >
                <CardFace card={card} />
                {instructor && !card.visible && <p className="-mt-1 px-4 pb-3 text-xs font-semibold text-muted">수강생에게 숨겨져 있어요</p>}
              </motion.button>
            </motion.div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
