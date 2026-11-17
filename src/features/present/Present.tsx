import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "../../components/ui/Avatar";
import type { PostDto } from "../../lib/cache";
import { Attachments } from "../post/Attachments";
import { Linkified } from "../post/Linkified";

/** 이 탭의 게시물을 한 장씩 크게 보여 준다 (plan.md 6.7). */
export default function Present({ posts, title, onClose }: { posts: PostDto[]; title: string; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const post = posts[Math.min(index, posts.length - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, posts.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [posts.length]);

  if (!post) return null;

  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-[60] flex flex-col bg-surface outline-none" data-testid="present">
          <div className="flex shrink-0 items-center gap-3 border-b border-line px-6 py-3">
            <Dialog.Title className="min-w-0 flex-1 truncate font-semibold">{title}</Dialog.Title>
            <span className="text-muted" data-testid="present-count">
              {index + 1} / {posts.length}
            </span>
            <Dialog.Close className="icon-btn" aria-label="발표 끝내기">
              <X size={22} strokeWidth={1.75} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <article className="mx-auto max-w-[1000px] px-6 py-10">
              <p className="mb-4 flex items-center gap-2 text-lg text-muted">
                <Avatar name={post.author.name} color={post.author.avatarColor} instructor={post.author.type === "instructor"} size={40} />
                {post.author.name}
              </p>
              {post.title && <h2 className="mb-4 text-[44px] leading-tight font-bold">{post.title}</h2>}
              {post.body && (
                <p className="text-2xl leading-relaxed whitespace-pre-wrap">
                  <Linkified text={post.body} />
                </p>
              )}
              <Attachments post={post} />
            </article>
          </div>
          <div className="flex shrink-0 justify-center gap-2 border-t border-line p-3">
            <button className="btn btn-ghost" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              <ChevronLeft size={20} strokeWidth={1.75} />
              이전
            </button>
            <button className="btn btn-ghost" disabled={index >= posts.length - 1} onClick={() => setIndex((i) => i + 1)}>
              다음
              <ChevronRight size={20} strokeWidth={1.75} />
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
