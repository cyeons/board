import { useQueryClient } from "@tanstack/react-query";
import { generateKeyBetween } from "fractional-indexing";
import { type FormEvent, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Switch } from "../../components/ui/Switch";
import { api, unwrap } from "../../lib/api";
import { type CardDto, type LectureData, PENDING, keys, patchLectureCards, upsertCard } from "../../lib/cache";
import { kstParts, kstToMs, todayKst } from "../../lib/format";
import { toastError } from "../../lib/toast";

const EMOJIS = ["📌", "📚", "📝", "💡", "🎯", "🧩", "🎨", "🔍", "💬", "🧪", "📊", "🖥️", "🎬", "🎧", "🌱", "⭐", "✅", "🚀", "📎", "🗂️"];

export function CardEditor({ lectureId, state, onClose }: { lectureId: string; state: { card: CardDto } | { afterId: string | null }; onClose: () => void }) {
  const card = "card" in state ? state.card : null;
  const qc = useQueryClient();
  const [emoji, setEmoji] = useState(card?.emoji ?? "📌");
  const [title, setTitle] = useState(card?.title ?? "");
  const [summary, setSummary] = useState(card?.summary ?? "");
  const [hasAssignment, setHasAssignment] = useState(card?.hasAssignment ?? true);
  const due = card?.assignmentDueAt ? kstParts(card.assignmentDueAt) : null;
  const [hasDue, setHasDue] = useState(Boolean(due));
  const [dueDate, setDueDate] = useState(due?.date ?? todayKst());
  const [dueTime, setDueTime] = useState(due?.time ?? "17:00");
  const [instructorOnly, setInstructorOnly] = useState(card?.assignmentVisibility === "instructor_only");

  // 저장을 누르면 창을 닫고 카드를 바로 보여 준다. 서버가 거절하면 되돌리고 알린다.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const json = {
      emoji,
      title,
      summary,
      hasAssignment,
      assignmentDueAt: hasAssignment && hasDue ? kstToMs(dueDate, dueTime) : null,
      assignmentVisibility: instructorOnly ? ("instructor_only" as const) : ("public" as const),
    };
    onClose();
    if (card) {
      upsertCard(qc, lectureId, { ...card, ...json });
      unwrap(api.admin.cards[":id"].$patch({ param: { id: card.id }, json }))
        .then((res) => upsertCard(qc, lectureId, res.card))
        .catch((err) => {
          upsertCard(qc, lectureId, card);
          toastError(err);
        });
      return;
    }
    const afterId = "afterId" in state ? state.afterId : null;
    const list = qc.getQueryData<LectureData>(keys.lecture(lectureId))?.cards ?? [];
    const at = afterId ? list.findIndex((c) => c.id === afterId) : list.length - 1;
    const temp: CardDto = {
      ...json,
      id: `${PENDING}${Date.now()}`,
      lectureId,
      sortKey: generateKeyBetween(list[at]?.sortKey ?? null, list[at + 1]?.sortKey ?? null),
      visible: false,
      materialCount: 0,
      assignmentCount: 0,
      lastPostAt: null,
      submitted: false,
    };
    upsertCard(qc, lectureId, temp);
    const drop = () => patchLectureCards(qc, lectureId, (cards) => cards.filter((c) => c.id !== temp.id));
    unwrap(api.admin.lectures[":id"].cards.$post({ param: { id: lectureId }, json: { ...json, visible: false, afterId } }))
      .then((res) => {
        drop();
        upsertCard(qc, lectureId, res.card);
      })
      .catch((err) => {
        drop();
        toastError(err);
      });
  };

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={card ? "카드 수정" : "카드 추가"}>
      <form className="space-y-4" onSubmit={submit}>
        <fieldset>
          <legend className="mb-1 font-medium">이모지</legend>
          <div className="flex flex-wrap gap-1">
            {EMOJIS.map((e) => (
              <button key={e} type="button" aria-label={`이모지 ${e}`} aria-pressed={emoji === e} className={`size-11 rounded-control text-xl ${emoji === e ? "bg-accent-soft ring-2 ring-accent" : "hover:bg-accent-soft"}`} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
          <input className="field mt-2 w-24" aria-label="이모지 직접 입력" maxLength={8} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        </fieldset>
        <div>
          <label htmlFor="card-title" className="mb-1 block font-medium">
            제목
          </label>
          <input id="card-title" className="field" required maxLength={100} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="card-summary" className="mb-1 block font-medium">
            한 줄 설명
          </label>
          <input id="card-summary" className="field" maxLength={200} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <Switch checked={hasAssignment} onCheckedChange={setHasAssignment} label="과제 탭 사용" showLabel />
        {hasAssignment && (
          <div className="space-y-3 rounded-control bg-accent-soft p-3">
            <Switch checked={hasDue} onCheckedChange={setHasDue} label="과제 마감" showLabel />
            {hasDue && (
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className="field" aria-label="마감 날짜" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                <input type="time" className="field" aria-label="마감 시각" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
              </div>
            )}
            <Switch checked={instructorOnly} onCheckedChange={setInstructorOnly} label="강사만 보기" showLabel />
            <p className="text-sm text-muted">켜면 수강생에게 자기 글만 보여요.</p>
          </div>
        )}
        {!card && <p className="text-sm text-muted">새 카드는 숨겨진 채로 만들어져요. 준비되면 공개로 바꿔 주세요.</p>}
        <button className="btn btn-primary w-full">
          {card ? "저장" : "카드 만들기"}
        </button>
      </form>
    </Modal>
  );
}
