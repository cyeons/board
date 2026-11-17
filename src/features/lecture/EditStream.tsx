import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, Plus } from "lucide-react";
import { useState } from "react";
import { DotsMenu } from "../../components/ui/Menu";
import { Switch } from "../../components/ui/Switch";
import { api, unwrap } from "../../lib/api";
import { type CardDto, keys, patchLectureCards, upsertCard } from "../../lib/cache";
import { toast, toastError } from "../../lib/toast";
import { CardEditor } from "./CardEditor";
import { CardFace } from "./Stream";

type EditorState = { card: CardDto } | { afterId: string | null } | null;

function Row({ card, lectureId, onEdit, onAddAfter }: { card: CardDto; lectureId: string; onEdit: () => void; onAddAfter: () => void }) {
  const qc = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  async function remove() {
    patchLectureCards(qc, lectureId, (cards) => cards.filter((c) => c.id !== card.id));
    try {
      await unwrap(api.admin.cards[":id"].$delete({ param: { id: card.id } }));
      toast("카드를 지웠어요.", {
        action: {
          label: "실행 취소",
          run: () => {
            void unwrap(api.admin.cards[":id"].restore.$post({ param: { id: card.id } }))
              .then((res) => upsertCard(qc, lectureId, { ...res.card, materialCount: card.materialCount, assignmentCount: card.assignmentCount, lastPostAt: card.lastPostAt }))
              .catch(toastError);
          },
        },
      });
    } catch (e) {
      upsertCard(qc, lectureId, card);
      toastError(e);
    }
  }

  return (
    <li ref={setNodeRef} style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition, zIndex: isDragging ? 10 : undefined }} className="group relative" data-testid="edit-card" data-card-title={card.title}>
      <div className={`surface flex items-center rounded-card ${isDragging ? "shadow-raised" : ""}`}>
        <button {...attributes} {...listeners} className="flex min-h-11 w-10 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-l-card text-muted hover:bg-accent-soft" aria-label={`${card.title} 순서 옮기기`}>
          <GripVertical size={20} strokeWidth={1.75} />
        </button>
        <div className={`min-w-0 flex-1 ${card.visible ? "" : "opacity-60"}`}>
          <CardFace card={card} />
        </div>
        <Switch
          label={`${card.title} 공개`}
          checked={card.visible}
          onCheckedChange={(visible) => {
            const set = (v: boolean) => patchLectureCards(qc, lectureId, (cards) => cards.map((c) => (c.id === card.id ? { ...c, visible: v } : c)));
            set(visible);
            void unwrap(api.admin.cards[":id"].$patch({ param: { id: card.id }, json: { visible } })).catch((e) => {
              set(!visible);
              toastError(e);
            });
          }}
        />
        <DotsMenu
          label={`${card.title} 메뉴`}
          items={[
            { label: "수정", onSelect: onEdit },
            {
              label: "복제",
              onSelect: () => {
                void unwrap(api.admin.cards[":id"].duplicate.$post({ param: { id: card.id } }))
                  .then((res) => upsertCard(qc, lectureId, { ...res.card, materialCount: card.materialCount }))
                  .catch(toastError);
              },
            },
            { label: "삭제", danger: true, onSelect: () => void remove() },
          ]}
        />
      </div>
      <div className="flex h-3 items-center justify-center opacity-0 transition-opacity duration-(--duration-base) group-hover:opacity-100 focus-within:opacity-100">
        <button className="z-10 inline-flex min-h-8 items-center gap-1 rounded-full bg-accent px-3 text-sm font-semibold text-on-accent shadow-base" onClick={onAddAfter}>
          <Plus size={14} strokeWidth={2} />
          카드 추가
        </button>
      </div>
    </li>
  );
}

/** 강의 페이지의 편집 모드: 끌어서 순서 바꾸기, 숨김, 복제, 삭제, 사이에 추가 */
export default function EditStream({ lectureId, cards }: { lectureId: string; cards: CardDto[] }) {
  const qc = useQueryClient();
  const [editor, setEditor] = useState<EditorState>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function onDragEnd(e: DragEndEvent) {
    const from = cards.findIndex((c) => c.id === e.active.id);
    const to = cards.findIndex((c) => c.id === e.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    const next = arrayMove(cards, from, to);
    patchLectureCards(qc, lectureId, () => next);
    void unwrap(api.admin.cards[":id"].move.$patch({ param: { id: String(e.active.id) }, json: { before: next[to - 1]?.id ?? null, after: next[to + 1]?.id ?? null } }))
      .then(({ sortKey }) => patchLectureCards(qc, lectureId, (list) => list.map((c) => (c.id === e.active.id ? { ...c, sortKey } : c))))
      .catch((err) => {
        toastError(err);
        void qc.invalidateQueries({ queryKey: keys.lecture(lectureId) });
      });
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1" data-testid="edit-stream">
            {cards.map((card) => (
              <Row key={card.id} card={card} lectureId={lectureId} onEdit={() => setEditor({ card })} onAddAfter={() => setEditor({ afterId: card.id })} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <button className="btn btn-ghost w-full" onClick={() => setEditor({ afterId: cards.at(-1)?.id ?? null })}>
        <Plus size={18} strokeWidth={1.75} />
        카드 추가
      </button>
      {editor && <CardEditor lectureId={lectureId} state={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}
