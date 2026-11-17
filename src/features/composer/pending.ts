import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { api, errorText, unwrap } from "../../lib/api";
import { type PostDto, patchLectureCards, upsertPost } from "../../lib/cache";
import { haptic } from "../../lib/haptics";
import { toast } from "../../lib/toast";
import { type UploadCategory, uploadFile } from "../../lib/upload";
import { clearDraft } from "./drafts";

export type LinkInput = { url: string; title?: string | null; description?: string | null; image?: string | null; site?: string | null };

export type PendingFile = { file: File; progress: number; fileId?: string };

/** 게시를 눌렀지만 아직 업로드 중인 글. 작성자 화면에만 보인다 (Q101). */
export type PendingPost = {
  id: string;
  cardId: string;
  lectureId: string;
  courseId: string;
  tab: "material" | "assignment";
  groupId: string | null;
  title: string;
  body: string;
  files: PendingFile[];
  links: LinkInput[];
  keep: ({ fileId: string } | LinkInput)[];
  editId?: string;
  authorName: string;
  avatarColor: number;
  isInstructor: boolean;
  status: "uploading" | "failed";
  error?: string;
};

let items: PendingPost[] = [];
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());

function update(id: string, fn: (p: PendingPost) => PendingPost) {
  items = items.map((p) => (p.id === id ? fn(p) : p));
  publish();
}

export function usePendingPosts(cardId: string, tab: string) {
  const all = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
  return all.filter((p) => p.cardId === cardId && p.tab === tab);
}

export const discardPending = (id: string) => {
  items = items.filter((p) => p.id !== id);
  publish();
};

export async function runPending(qc: QueryClient, id: string) {
  const start = items.find((p) => p.id === id);
  if (!start) return;
  update(id, (p) => ({ ...p, status: "uploading", error: undefined }));
  const category: UploadCategory = start.isInstructor ? "material" : "student";
  try {
    for (const [i, entry] of start.files.entries()) {
      if (entry.fileId) continue;
      const { fileId } = await uploadFile(
        entry.file,
        { courseId: start.courseId, lectureId: start.lectureId, category },
        (fraction) => update(id, (p) => ({ ...p, files: p.files.map((f, n) => (n === i ? { ...f, progress: fraction } : f)) })),
      );
      update(id, (p) => ({ ...p, files: p.files.map((f, n) => (n === i ? { ...f, progress: 1, fileId } : f)) }));
    }
    const done = items.find((p) => p.id === id)!;
    const attachments = [...done.keep, ...done.files.map((f) => ({ fileId: f.fileId! })), ...done.links];
    let post: PostDto;
    if (done.editId) {
      post = (await unwrap(api.posts[":id"].$patch({ param: { id: done.editId }, json: { title: done.title, body: done.body, attachments } }))).post;
      upsertPost(qc, post);
    } else {
      post = (await unwrap(api.cards[":id"].posts.$post({ param: { id: done.cardId }, json: { tab: done.tab, title: done.title, body: done.body, attachments, groupId: done.groupId } }))).post;
      upsertPost(qc, post);
      clearDraft(done.cardId, done.tab);
      if (done.tab === "assignment" && !done.isInstructor) patchLectureCards(qc, done.lectureId, (cards) => cards.map((c) => (c.id === done.cardId ? { ...c, submitted: true } : c)));
    }
    discardPending(id);
    haptic();
    if (done.files.length) toast(done.editId ? "고쳤어요." : "올렸어요. 이제 모두에게 보여요.");
  } catch (e) {
    update(id, (p) => ({ ...p, status: "failed", error: errorText(e) }));
  }
}

export function addPending(qc: QueryClient, input: Omit<PendingPost, "id" | "status">) {
  const id = crypto.randomUUID();
  items = [...items, { ...input, id, status: "uploading" }];
  publish();
  void runPending(qc, id);
  return id;
}
