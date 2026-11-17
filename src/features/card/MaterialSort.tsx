import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { useParams } from "react-router";
import { api, unwrap } from "../../lib/api";
import { type PostDto, keys } from "../../lib/cache";
import { toastError } from "../../lib/toast";
import { PostCard } from "../post/PostCard";

function SortableRow({ post, canWrite, onEdit }: { post: PostDto; canWrite: boolean; onEdit: (post: PostDto) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: post.id });
  return (
    <div
      ref={setNodeRef}
      className="relative pl-11"
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition, zIndex: isDragging ? 10 : undefined, opacity: isDragging ? 0.85 : 1 }}
    >
      <button {...attributes} {...listeners} className="absolute top-2 left-0 flex size-11 cursor-grab touch-none items-center justify-center rounded-full text-muted hover:bg-fill-strong" aria-label={`${post.title || "자료"} 순서 옮기기`}>
        <GripVertical size={18} strokeWidth={2} />
      </button>
      <PostCard post={post} canWrite={canWrite} onEdit={onEdit} />
    </div>
  );
}

/** 강사가 자료를 끌어서 순서를 바꾼다. dnd-kit은 강사 화면에서만 불러온다. */
export default function MaterialSort({ posts, canWrite, onEdit }: { posts: PostDto[]; canWrite: boolean; onEdit: (post: PostDto) => void }) {
  const { cardId = "" } = useParams();
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function onDragEnd(e: DragEndEvent) {
    const from = posts.findIndex((p) => p.id === e.active.id);
    const to = posts.findIndex((p) => p.id === e.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    const next = arrayMove(posts, from, to);
    const key = keys.posts(cardId, "material", "order");
    qc.setQueryData<{ posts: PostDto[] }>(key, { posts: next });
    void unwrap(
      api.admin.posts[":id"].move.$patch({
        param: { id: String(e.active.id) },
        json: { before: next[to - 1]?.id ?? null, after: next[to + 1]?.id ?? null },
      }),
    )
      .then(({ sortKey }) => qc.setQueryData<{ posts: PostDto[] }>(key, (d) => (d ? { posts: d.posts.map((p) => (p.id === e.active.id ? { ...p, sortKey } : p)) } : d)))
      .catch((err) => {
        toastError(err);
        void qc.invalidateQueries({ queryKey: key });
      });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={posts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3" data-testid="material-sort">
          {posts.map((p) => (
            <SortableRow key={p.id} post={p} canWrite={canWrite} onEdit={onEdit} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
