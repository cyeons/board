import { useQueryClient } from "@tanstack/react-query";
import { Avatar, InstructorBadge } from "../../components/ui/Avatar";
import { type PendingPost, discardPending, runPending } from "./pending";

/** 게시를 눌렀고 파일이 올라가는 중인 글. 작성자에게만 보인다. */
export function PendingCard({ post }: { post: PendingPost }) {
  const qc = useQueryClient();
  return (
    <article className="rounded-post border border-dashed border-line-strong bg-surface p-4" data-testid="pending-post">
      <header className="flex items-center gap-2">
        <Avatar name={post.authorName} color={post.avatarColor} instructor={post.isInstructor} />
        <p className="flex items-center gap-1 font-semibold">
          {post.authorName}
          {post.isInstructor && <InstructorBadge />}
        </p>
      </header>
      {post.title && <h3 className="mt-2 text-md font-semibold">{post.title}</h3>}
      {post.body && <p className="mt-1 whitespace-pre-wrap">{post.body}</p>}
      {post.files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {post.files.map((f, i) => (
            <li key={`${f.file.name}-${i}`}>
              <p className="truncate text-sm">{f.file.name}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-accent-soft" role="progressbar" aria-valuenow={Math.round(f.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${f.file.name} 올리는 중`}>
                <div className="h-full bg-accent transition-[width] duration-(--duration-base)" style={{ width: `${f.progress * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {post.status === "uploading" && <p className="mt-2 text-sm text-muted">올리는 중이에요. 끝나면 다른 사람에게도 보여요.</p>}
      {post.status === "failed" && (
        <div className="mt-2">
          <p role="alert" className="text-danger">
            {post.error}
          </p>
          <div className="mt-2 flex gap-2">
            <button className="btn btn-primary" onClick={() => void runPending(qc, post.id)}>
              다시 시도
            </button>
            <button className="btn btn-ghost" onClick={() => discardPending(post.id)}>
              취소
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
