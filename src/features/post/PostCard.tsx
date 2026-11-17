import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Pin } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { memo } from "react";
import { useNavigate, useParams } from "react-router";
import { Avatar, InstructorBadge } from "../../components/ui/Avatar";
import { DotsMenu, type MenuItem } from "../../components/ui/Menu";
import { api, unwrap } from "../../lib/api";
import { type PostDto, keys, patchPost, removePost, upsertPost } from "../../lib/cache";
import { timeAgo } from "../../lib/format";
import { rise, riseReduced } from "../../lib/motion";
import { toast, toastError } from "../../lib/toast";
import { Comments } from "../comments/Comments";
import { useCourse } from "../entry/course";
import { LikeButton } from "../likes/LikeButton";
import { Attachments } from "./Attachments";
import { Linkified } from "./Linkified";

export function usePostActions(post: PostDto) {
  const qc = useQueryClient();
  const recheck = () => post.tab === "assignment" && void qc.invalidateQueries({ queryKey: keys.lecture(post.lectureId) });
  return {
    async remove() {
      removePost(qc, post.id);
      try {
        await unwrap(api.posts[":id"].$delete({ param: { id: post.id } }));
        recheck();
        toast("글을 지웠어요.", {
          action: {
            label: "실행 취소",
            run: () => {
              void unwrap(api.posts[":id"].restore.$post({ param: { id: post.id } }))
                .then((res) => {
                  upsertPost(qc, res.post);
                  recheck();
                })
                .catch(toastError);
            },
          },
        });
      } catch (e) {
        upsertPost(qc, post);
        toastError(e);
      }
    },
    // 고정을 바로 보여 주고(맨 위로 옮겨짐), 실패하면 되돌린다
    async togglePin() {
      const pinned = !post.pinnedAt;
      const set = (pinnedAt: number | null) => {
        upsertPost(qc, { ...post, pinnedAt });
        patchPost(qc, post.id, (p) => ({ ...p, pinnedAt }));
      };
      set(pinned ? Date.now() : null);
      try {
        const res = pinned ? await unwrap(api.admin.posts[":id"].pin.$put({ param: { id: post.id } })) : await unwrap(api.admin.posts[":id"].pin.$delete({ param: { id: post.id } }));
        set(res.pinnedAt);
      } catch (e) {
        set(post.pinnedAt);
        toastError(e);
      }
    },
  };
}

export const PostCard = memo(function PostCard({ post, canWrite, onEdit }: { post: PostDto; canWrite: boolean; onEdit: (post: PostDto) => void }) {
  const { me, instructor, course } = useCourse();
  const { lectureId = "", cardId = "" } = useParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const actions = usePostActions(post);
  const mine = Boolean(me && post.author.publicId === me.publicId);
  const isInstructorPost = post.author.type === "instructor";

  const items: MenuItem[] = [];
  if (instructor) items.push({ label: post.pinnedAt ? "고정 풀기" : "고정", onSelect: () => void actions.togglePin() });
  if (instructor || (mine && canWrite)) {
    items.push({ label: "수정", onSelect: () => onEdit(post) });
    items.push({ label: "삭제", danger: true, onSelect: () => void actions.remove() });
  }

  const open = () => void navigate(`/${encodeURIComponent(course.slug)}/l/${lectureId}/c/${cardId || post.cardId}/p/${post.id}`);

  return (
    <motion.article
      initial="hidden"
      animate="shown"
      variants={reduced ? riseReduced : rise}
      className={`rounded-post bg-surface p-4 shadow-base [content-visibility:auto] [contain-intrinsic-size:auto_200px] ${post.pinnedAt ? "ring-2 ring-accent" : ""}`}
      data-testid="post"
      data-post-title={post.title}
      onClick={(e) => {
        // 내용을 복사하려고 글자를 고른 것이면 열지 않는다
        if (window.getSelection()?.toString()) return;
        if (!(e.target as HTMLElement).closest("a, button, input, textarea, video, iframe, [role=menu], [role=dialog]:not([data-card-detail])")) open();
      }}
    >
      <header className="flex items-center gap-2.5">
        <Avatar name={post.author.name} color={post.author.avatarColor} instructor={isInstructorPost} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-bold">{post.author.name}</span>
            {isInstructorPost && <InstructorBadge />}
            {post.isLate && <span className="chip bg-[var(--tile-1)] text-[var(--group-2)]">늦은 제출</span>}
          </p>
          <p className="text-xs text-muted">{timeAgo(post.createdAt)}</p>
        </div>
        {post.pinnedAt && <Pin size={18} strokeWidth={2} className="text-accent-ink" role="img" aria-label="고정된 글" />}
        {items.length > 0 && <DotsMenu items={items} label="글 메뉴" />}
      </header>
      {post.title && <h3 className="mt-3 text-md font-bold">{post.title}</h3>}
      {post.body && (
        <p className="mt-1 whitespace-pre-wrap">
          <Linkified text={post.body} />
        </p>
      )}
      <Attachments post={post} />
      <footer className="mt-3 -ml-2 flex items-center gap-1">
        <LikeButton post={post} disabled={!canWrite} />
        <button className="press inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-sm font-semibold text-muted hover:bg-fill" aria-label={`댓글 ${post.commentCount}개, 크게 보기`} onClick={(e) => { e.stopPropagation(); open(); }}>
          <MessageCircle size={20} strokeWidth={2} />
          {post.commentCount}
        </button>
      </footer>
      <Comments post={post} canWrite={canWrite} />
    </motion.article>
  );
});
