import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Avatar, InstructorBadge } from "../../components/ui/Avatar";
import { DotsMenu } from "../../components/ui/Menu";
import { api, errorText, unwrap } from "../../lib/api";
import { type CommentDto, PENDING, type PostDto, keys, removeComment, upsertComment } from "../../lib/cache";
import { timeAgo } from "../../lib/format";
import { spring } from "../../lib/motion";
import { toast, toastError } from "../../lib/toast";
import { useCourse } from "../entry/course";
import { Linkified } from "../post/Linkified";

function CommentRow({ comment, post, canWrite }: { comment: CommentDto; post: PostDto; canWrite: boolean }) {
  const { me, instructor } = useCourse();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const mine = Boolean(me && comment.author.publicId === me.publicId);
  const canChange = instructor || (mine && canWrite);

  async function remove() {
    const before = post.commentCount;
    removeComment(qc, post.id, comment.id, before - 1);
    try {
      await unwrap(api.comments[":id"].$delete({ param: { id: comment.id } }));
      toast("댓글을 지웠어요.", {
        action: {
          label: "실행 취소",
          run: () => {
            void unwrap(api.comments[":id"].restore.$post({ param: { id: comment.id } }))
              .then((res) => {
                upsertComment(qc, res.comment, before);
                void qc.invalidateQueries({ queryKey: keys.comments(post.id) });
              })
              .catch(toastError);
          },
        },
      });
    } catch (e) {
      upsertComment(qc, comment, before);
      toastError(e);
    }
  }

  // 고친 내용을 바로 보여 주고, 실패하면 되돌린다
  async function save() {
    upsertComment(qc, { ...comment, body }, post.commentCount);
    setEditing(false);
    try {
      const res = await unwrap(api.comments[":id"].$patch({ param: { id: comment.id }, json: { body } }));
      upsertComment(qc, res.comment, post.commentCount);
    } catch (e) {
      upsertComment(qc, comment, post.commentCount);
      setEditing(true);
      toastError(e);
    }
  }

  const isInstructor = comment.author.type === "instructor";
  const reduced = useReducedMotion();
  return (
    <motion.li
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: comment.id.startsWith(PENDING) ? 0.6 : 1, y: 0 }}
      transition={spring}
      className={`flex gap-2.5 rounded-control px-2.5 py-2 ${isInstructor ? "bg-accent-soft" : ""}`}
      data-testid="comment"
    >
      <Avatar name={comment.author.name} color={comment.author.avatarColor} size={28} instructor={isInstructor} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1 text-sm">
          <span className="font-semibold">{comment.author.name}</span>
          {isInstructor && <InstructorBadge />}
          <span className="text-muted">{timeAgo(comment.createdAt)}</span>
        </p>
        {editing ? (
          <form
            className="mt-1 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input className="field min-w-0 flex-1" aria-label="댓글 고치기" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
            <button className="btn btn-primary shrink-0">저장</button>
          </form>
        ) : (
          <p className="whitespace-pre-wrap">
            <Linkified text={comment.body} />
          </p>
        )}
      </div>
      {canChange && !editing && !comment.id.startsWith(PENDING) && (
        <DotsMenu
          label="댓글 메뉴"
          items={[
            ...(mine || instructor ? [{ label: "수정", onSelect: () => setEditing(true) }] : []),
            { label: "삭제", danger: true, onSelect: () => void remove() },
          ]}
        />
      )}
    </motion.li>
  );
}

export function Comments({ post, canWrite, expanded }: { post: PostDto; canWrite: boolean; expanded?: boolean }) {
  const qc = useQueryClient();
  const { course, me, instructor } = useCourse();
  const [showAll, setShowAll] = useState(Boolean(expanded));
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const all = useQuery({
    queryKey: keys.comments(post.id),
    enabled: showAll,
    queryFn: () => unwrap(api.posts[":id"].comments.$get({ param: { id: post.id } })),
  });
  const list = showAll ? (all.data?.comments ?? post.recentComments) : post.recentComments;
  const hidden = post.commentCount - post.recentComments.length;

  // 보내는 즉시 흐린 댓글로 보여 주고, 저장되면 진짜 댓글로 바꾼다. 실패하면 지우고 쓴 글을 입력칸에 되돌린다.
  async function submit() {
    const text = body;
    if (!text.trim() || busy) return;
    setBusy(true);
    setBody("");
    const now = Date.now();
    const temp: CommentDto = {
      id: `${PENDING}${now}`,
      postId: post.id,
      author: instructor ? { type: "instructor", publicId: null, name: course.instructorName, avatarColor: 0 } : { type: "participant", publicId: me?.publicId ?? null, name: me?.nickname ?? "", avatarColor: me?.avatarColor ?? 0 },
      body: text,
      createdAt: now,
      updatedAt: now,
    };
    const count = post.commentCount;
    upsertComment(qc, temp, count + 1);
    try {
      const res = await unwrap(api.posts[":id"].comments.$post({ param: { id: post.id }, json: { body: text } }));
      removeComment(qc, post.id, temp.id, count);
      upsertComment(qc, res.comment, count + 1);
    } catch (e) {
      removeComment(qc, post.id, temp.id, count);
      setBody(text);
      toast(errorText(e), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      {!showAll && hidden > 0 && (
        <button className="min-h-11 text-sm font-medium text-accent-ink" onClick={() => setShowAll(true)}>
          댓글 {hidden}개 더 보기
        </button>
      )}
      {list.length > 0 && (
        <ul className="space-y-1">
          {list.map((c) => (
            <CommentRow key={c.id} comment={c} post={post} canWrite={canWrite} />
          ))}
        </ul>
      )}
      {canWrite && !composing && !body && (
        <button className="mt-1 flex min-h-11 w-full items-center rounded-control px-2.5 text-left text-sm font-medium text-muted hover:bg-fill" onClick={() => setComposing(true)}>
          댓글 추가
        </button>
      )}
      {canWrite && (composing || body) && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            className="field min-w-0 flex-1"
            placeholder="댓글 추가"
            aria-label="댓글 추가"
            maxLength={1000}
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={(e) => {
              // 보내기 버튼으로 옮겨 간 것이면 접지 않는다
              if (!body.trim() && !e.currentTarget.form?.contains(e.relatedTarget as Node)) setComposing(false);
            }}
          />
          {body.trim() && (
            <button className="btn btn-primary shrink-0" disabled={busy}>
              보내기
            </button>
          )}
        </form>
      )}
    </div>
  );
}
