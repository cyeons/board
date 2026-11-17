import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { motion, useAnimationControls } from "motion/react";
import { useState } from "react";
import { InstructorBadge } from "../../components/ui/Avatar";
import { Modal } from "../../components/ui/Modal";
import { api, errorText, unwrap } from "../../lib/api";
import { type PostDto, patchPost } from "../../lib/cache";
import { haptic } from "../../lib/haptics";
import { toastError } from "../../lib/toast";

function Likers({ postId, open, onOpenChange }: { postId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const list = useQuery({
    queryKey: ["likes", postId],
    enabled: open,
    staleTime: 0,
    queryFn: () => unwrap(api.posts[":id"].likes.$get({ param: { id: postId } })),
  });
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="좋아요를 누른 사람">
      {list.isError && <p role="alert">{errorText(list.error)}</p>}
      {list.data?.likers.length === 0 && <p className="text-muted">아직 아무도 누르지 않았어요.</p>}
      <ul className="space-y-2">
        {list.data?.likers.map((l, i) => (
          <li key={i} className="flex items-center gap-2">
            {l.name}
            {l.isInstructor && <InstructorBadge />}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function LikeButton({ post, disabled }: { post: PostDto; disabled: boolean }) {
  const qc = useQueryClient();
  const controls = useAnimationControls();
  const [showLikers, setShowLikers] = useState(false);

  async function toggle() {
    const next = !post.liked;
    // 누르면 하트가 톡 커졌다 돌아오고, Android에서는 짧게 진동한다
    if (next) {
      void controls.start({ scale: [0.7, 1.25, 1], transition: { duration: 0.42, times: [0, 0.45, 1], ease: "easeOut" } });
      haptic();
    }
    patchPost(qc, post.id, (p) => ({ ...p, liked: next, likeCount: p.likeCount + (next ? 1 : -1) }));
    try {
      const res = next ? await unwrap(api.posts[":id"].like.$put({ param: { id: post.id } })) : await unwrap(api.posts[":id"].like.$delete({ param: { id: post.id } }));
      patchPost(qc, post.id, (p) => ({ ...p, liked: res.liked, likeCount: res.count, instructorLiked: res.instructorLiked }));
    } catch (e) {
      patchPost(qc, post.id, (p) => ({ ...p, liked: !next, likeCount: p.likeCount + (next ? -1 : 1) }));
      toastError(e);
    }
  }

  return (
    <span className="inline-flex items-center" onClick={(e) => e.stopPropagation()}>
      <button className={`icon-btn ${post.liked ? "text-danger hover:text-danger" : ""}`} aria-pressed={post.liked} aria-label={post.liked ? "좋아요 취소" : "좋아요"} disabled={disabled} onClick={() => void toggle()}>
        <motion.span animate={controls} className="inline-flex">
          <Heart size={21} strokeWidth={2} fill={post.liked ? "currentColor" : "none"} />
        </motion.span>
      </button>
      <button className="-ml-1.5 min-h-11 min-w-6 pr-1 text-sm font-semibold text-muted" aria-label={`좋아요 ${post.likeCount}개, 누른 사람 보기`} onClick={() => setShowLikers(true)} data-testid="like-count">
        {post.likeCount}
      </button>
      {post.instructorLiked && (
        <span className="ml-1 chip bg-accent-soft px-2 py-0.5 text-xs text-accent-ink" data-testid="instructor-liked">
          강사
        </span>
      )}
      <Likers postId={post.id} open={showLikers} onOpenChange={setShowLikers} />
    </span>
  );
}
