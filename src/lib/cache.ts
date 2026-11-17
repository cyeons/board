import type { QueryClient } from "@tanstack/react-query";
import type { CardDto, CommentDto, PostDto } from "../../worker/lib/dto";

export type { CardDto, CommentDto, PostDto };

type PostsData = { posts: PostDto[] };

export type LectureData = {
  course: { id: string; slug: string; title: string; instructorName: string; status: string };
  lecture: { id: string; courseId: string; date: string; startTime: string; title: string; description: string; coverFileId: string | null; published: boolean; status: string; autoClosed: boolean };
  locked: boolean;
  notice: PostDto | null;
  cards: CardDto[];
};

/** 즉시 반영으로 먼저 그린, 아직 서버에 저장되지 않은 댓글과 카드의 임시 ID 앞부분 */
export const PENDING = "pending-";
const isPending = (id: string) => id.startsWith(PENDING);

export const keys = {
  course: (slug: string) => ["course", slug] as const,
  lecture: (id: string) => ["lecture", id] as const,
  posts: (cardId: string, tab: string, sort: string) => ["posts", cardId, tab, sort] as const,
  post: (id: string) => ["post", id] as const,
  comments: (postId: string) => ["comments", postId] as const,
  me: (courseId: string) => ["me", courseId] as const,
  help: (courseId: string) => ["help", courseId] as const,
};

/** 정렬: 고정 글이 먼저, 그다음 고른 순서 */
export function sortPosts(posts: PostDto[], tab: string, sort: string): PostDto[] {
  const list = [...posts];
  const order = (a: PostDto, b: PostDto) => {
    if (tab === "material") return (a.sortKey ?? "") < (b.sortKey ?? "") ? -1 : 1;
    if (sort === "oldest") return a.createdAt - b.createdAt;
    if (sort === "likes") return b.likeCount - a.likeCount || b.createdAt - a.createdAt;
    return b.createdAt - a.createdAt;
  };
  return list.sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0) || order(a, b));
}

/** 이 게시물이 있는 모든 캐시를 고친다. */
export function patchPost(qc: QueryClient, postId: string, fn: (post: PostDto) => PostDto) {
  qc.setQueriesData<PostsData>({ queryKey: ["posts"] }, (data) => (data ? { posts: data.posts.map((p) => (p.id === postId ? fn(p) : p)) } : data));
  qc.setQueryData<{ post: PostDto }>(keys.post(postId), (data) => (data ? { post: fn(data.post) } : data));
}

/** 글을 넣거나 바꾼다. 처음 보는 글이면 true를 돌려준다. */
export function upsertPost(qc: QueryClient, post: PostDto): boolean {
  if (!post.cardId) return false;
  let isNew = true;
  for (const [key, data] of qc.getQueriesData<PostsData>({ queryKey: ["posts", post.cardId, post.tab] })) {
    if (!data) continue;
    const found = data.posts.find((p) => p.id === post.id);
    if (found) isNew = false;
    const merged = found ? { ...post, liked: post.liked || found.liked } : post;
    qc.setQueryData<PostsData>(key, { posts: sortPosts(found ? data.posts.map((p) => (p.id === post.id ? merged : p)) : [merged, ...data.posts], post.tab, String(key[3])) });
  }
  qc.setQueryData<{ post: PostDto }>(keys.post(post.id), (data) => (data ? { post: { ...post, liked: post.liked || data.post.liked } } : data));
  return isNew;
}

export function removePost(qc: QueryClient, postId: string): PostDto | null {
  let removed: PostDto | null = null;
  qc.setQueriesData<PostsData>({ queryKey: ["posts"] }, (data) => {
    if (!data) return data;
    const hit = data.posts.find((p) => p.id === postId);
    if (hit) removed = hit;
    return { posts: data.posts.filter((p) => p.id !== postId) };
  });
  return removed;
}

export function patchLectureCards(qc: QueryClient, lectureId: string, fn: (cards: CardDto[]) => CardDto[]) {
  qc.setQueryData<LectureData>(keys.lecture(lectureId), (data) => (data ? { ...data, cards: fn(data.cards) } : data));
}

/**
 * 카드를 넣거나 바꾼다. 응답과 실시간 이벤트가 겹쳐도 한 번만 들어가고, 개수는 지금 값을 유지한다.
 * 진짜 카드가 처음 들어오면, 먼저 그려 둔 같은 제목의 임시 카드를 대신한다.
 */
export function upsertCard(qc: QueryClient, lectureId: string, card: CardDto) {
  patchLectureCards(qc, lectureId, (cards) => {
    const had = cards.find((c) => c.id === card.id);
    const merged = had ? { ...card, materialCount: had.materialCount, assignmentCount: had.assignmentCount, lastPostAt: had.lastPostAt, submitted: had.submitted } : card;
    const rest = had || isPending(card.id) ? cards : cards.filter((c) => !(isPending(c.id) && c.title === card.title));
    return (had ? rest.map((c) => (c.id === card.id ? merged : c)) : [...rest, merged]).sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
  });
}

/** 카드의 자료, 과제 개수와 마지막 글 시각을 맞춘다. */
export function bumpCardCount(qc: QueryClient, lectureId: string, cardId: string, tab: string, delta: number, at?: number) {
  patchLectureCards(qc, lectureId, (cards) =>
    cards.map((c) =>
      c.id === cardId
        ? {
            ...c,
            materialCount: c.materialCount + (tab === "material" ? delta : 0),
            assignmentCount: c.assignmentCount + (tab === "assignment" ? delta : 0),
            lastPostAt: at ?? c.lastPostAt,
          }
        : c,
    ),
  );
}

/** 진짜 댓글이 처음 들어오면, 먼저 그려 둔 같은 사람의 같은 내용 임시 댓글을 대신한다 */
const replacesPending = (comment: CommentDto) => (c: CommentDto) =>
  !isPending(comment.id) && isPending(c.id) && c.body === comment.body && c.author.type === comment.author.type && c.author.publicId === comment.author.publicId;

export function upsertComment(qc: QueryClient, comment: CommentDto, commentCount: number) {
  const stale = replacesPending(comment);
  patchPost(qc, comment.postId, (p) => {
    const others = p.recentComments.filter((c) => c.id !== comment.id && !stale(c));
    const had = p.recentComments.some((c) => c.id === comment.id);
    return {
      ...p,
      commentCount,
      recentComments: had ? p.recentComments.map((c) => (c.id === comment.id ? comment : c)) : [...others, comment].slice(-2),
    };
  });
  qc.setQueryData<{ comments: CommentDto[] }>(keys.comments(comment.postId), (data) => {
    if (!data) return data;
    const had = data.comments.some((c) => c.id === comment.id);
    const rest = data.comments.filter((c) => !stale(c));
    return { comments: had ? rest.map((c) => (c.id === comment.id ? comment : c)) : [...rest, comment].sort((a, b) => a.createdAt - b.createdAt) };
  });
}

export function removeComment(qc: QueryClient, postId: string, commentId: string, commentCount: number) {
  patchPost(qc, postId, (p) => ({ ...p, commentCount, recentComments: p.recentComments.filter((c) => c.id !== commentId) }));
  qc.setQueryData<{ comments: CommentDto[] }>(keys.comments(postId), (data) => (data ? { comments: data.comments.filter((c) => c.id !== commentId) } : data));
}
