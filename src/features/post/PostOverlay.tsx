import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { Avatar, InstructorBadge } from "../../components/ui/Avatar";
import { Modal } from "../../components/ui/Modal";
import { api, errorText, unwrap } from "../../lib/api";
import { keys } from "../../lib/cache";
import { useLecture } from "../../lib/queries";
import { timeAgo } from "../../lib/format";
import { Comments } from "../comments/Comments";
import { useCourse } from "../entry/course";
import { LikeButton } from "../likes/LikeButton";
import { Attachments } from "./Attachments";
import { Linkified } from "./Linkified";

/** 게시물 크게 보기. 링크로 바로 열 수 있다. */
export default function PostOverlay() {
  const { postId = "", lectureId = "", cardId = "" } = useParams();
  const navigate = useNavigate();
  const { course, instructor, studentView } = useCourse();
  const query = useQuery({ queryKey: keys.post(postId), queryFn: () => unwrap(api.posts[":id"].$get({ param: { id: postId } })) });
  const post = query.data?.post;
  const { data: lecture } = useLecture(lectureId);
  const canWrite = !studentView && (instructor || (lecture?.lecture.status === "open" && course.status === "active"));
  const close = () => void navigate(`/${encodeURIComponent(course.slug)}/l/${lectureId}/c/${cardId}${post?.tab === "assignment" ? "?tab=assignment" : ""}`);
  const title = post?.title || (post ? `${post.author.name}님의 글` : "게시물");

  return (
    <Modal open onOpenChange={(v) => !v && close()} title={title} wide>
      {query.isError && (
        <div className="space-y-3">
          <p role="alert">{errorText(query.error)}</p>
          <button className="btn btn-ghost" onClick={close}>
            돌아가기
          </button>
        </div>
      )}
      {post && (
        <div data-testid="post-overlay">
          <header className="mb-2 flex items-center gap-2">
            <Avatar name={post.author.name} color={post.author.avatarColor} instructor={post.author.type === "instructor"} />
            <p className="flex flex-wrap items-center gap-1">
              <span className="font-semibold">{post.author.name}</span>
              {post.author.type === "instructor" && <InstructorBadge />}
              {post.isLate && <span className="chip bg-accent-soft text-[#8A6426]">늦은 제출</span>}
              <span className="text-sm text-muted">{timeAgo(post.createdAt)}</span>
            </p>
          </header>
          {post.body && (
            <p className="whitespace-pre-wrap">
              <Linkified text={post.body} />
            </p>
          )}
          <Attachments post={post} />
          <div className="mt-3 border-t border-line pt-2">
            <LikeButton post={post} disabled={!canWrite} />
          </div>
          <Comments post={post} canWrite={canWrite} expanded />
        </div>
      )}
    </Modal>
  );
}
