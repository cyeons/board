import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api, unwrap } from "./api";
import { type CardDto, type CommentDto, type PostDto, bumpCardCount, keys, patchLectureCards, patchPost, removeComment, removePost, upsertCard, upsertComment, upsertPost } from "./cache";
import { toast } from "./toast";

const MAX_BACKOFF_MS = 30_000;
const HIDDEN_LIMIT_MS = 5 * 60_000;
const PING_MS = 30_000;

type SocketOptions = {
  kind: "lecture" | "help";
  id: string;
  enabled: boolean;
  onMessage: (event: { type: string } & Record<string, unknown>) => void;
  /** 끊겼다가 다시 붙었을 때. 놓친 이벤트를 서버 데이터로 다시 맞춘다. */
  onReconnect: () => void;
  onConnected?: (ws: WebSocket | null) => void;
};

/** 티켓을 받아 연결하고, 끊기면 1초, 2초, 4초 ... 최대 30초 간격으로 다시 붙는다. */
export function useSocket({ kind, id, enabled, onMessage, onReconnect, onConnected }: SocketOptions) {
  const [connected, setConnected] = useState(true);
  const handlers = useRef({ onMessage, onReconnect, onConnected });
  handlers.current = { onMessage, onReconnect, onConnected };

  useEffect(() => {
    if (!enabled || !id) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempts = 0;
    let everConnected = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (stopped || document.hidden) return;
      // 강의실 전체가 같은 순간에 다시 붙지 않도록 조금씩 어긋나게 한다
      const delay = Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS) * (0.75 + Math.random() * 0.5);
      attempts += 1;
      retry = setTimeout(connect, delay);
    };

    async function connect() {
      if (stopped || ws) return;
      try {
        const { ticket } = await unwrap(api["ws-ticket"].$post({ json: { kind, id } }));
        if (stopped) return;
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(`${proto}//${location.host}/board/ws/${kind}/${id}?ticket=${encodeURIComponent(ticket)}`);
        ws = socket;
        socket.onopen = () => {
          attempts = 0;
          setConnected(true);
          handlers.current.onConnected?.(socket);
          if (everConnected) handlers.current.onReconnect();
          everConnected = true;
          ping = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send("ping"), PING_MS);
        };
        socket.onmessage = (e) => {
          if (e.data === "pong") return;
          try {
            handlers.current.onMessage(JSON.parse(e.data as string));
          } catch {
            // 알 수 없는 메시지는 무시한다
          }
        };
        socket.onclose = () => {
          clearInterval(ping);
          if (ws === socket) ws = null;
          handlers.current.onConnected?.(null);
          if (!stopped) {
            setConnected(false);
            schedule();
          }
        };
      } catch {
        setConnected(false);
        schedule();
      }
    }

    const onVisibility = () => {
      clearTimeout(hiddenTimer);
      if (document.hidden) {
        hiddenTimer = setTimeout(() => ws?.close(), HIDDEN_LIMIT_MS);
      } else if (!ws) {
        clearTimeout(retry);
        attempts = 0;
        void connect();
      }
    };
    const onOnline = () => {
      if (!ws) {
        clearTimeout(retry);
        attempts = 0;
        void connect();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    void connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(hiddenTimer);
      clearInterval(ping);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      ws?.close();
    };
  }, [kind, id, enabled]);

  return connected;
}

export type Presence = { count: number; participants: { publicId: string; nickname: string; groupId: string | null }[] };

/** 강의 방 이벤트를 받아 TanStack Query 캐시를 고친다 (plan.md 11.4). */
export function useLectureRoom(lectureId: string, enabled: boolean, opts: { isInstructor?: boolean; slug: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const go = (path: string) => () => void navigate(`/${encodeURIComponent(opts.slug)}/l/${lectureId}${path}`);
  const [presence, setPresence] = useState<Presence>({ count: 0, participants: [] });

  const connected = useSocket({
    kind: "lecture",
    id: lectureId,
    enabled,
    onReconnect: () => void qc.invalidateQueries({ type: "active" }),
    onMessage: (e) => {
      switch (e.type) {
        case "lecture.status":
          void qc.invalidateQueries({ queryKey: keys.lecture(lectureId) });
          void qc.invalidateQueries({ queryKey: ["course"] });
          break;
        case "notice.update":
          void qc.invalidateQueries({ queryKey: keys.lecture(lectureId) });
          break;
        case "card.upsert": {
          upsertCard(qc, lectureId, e.card as CardDto);
          const card = e.card as CardDto;
          if (e.revealed && !opts.isInstructor) toast(`새 카드가 공개됐어요: ${card.title}`, { action: { label: "보기", run: go(`/c/${card.id}`) } });
          break;
        }
        case "card.remove":
          patchLectureCards(qc, lectureId, (cards) => cards.filter((c) => c.id !== e.cardId));
          break;
        case "card.move":
          patchLectureCards(qc, lectureId, (cards) => cards.map((c) => (c.id === e.cardId ? { ...c, sortKey: e.sortKey as string } : c)).sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1)));
          break;
        case "post.upsert": {
          const post = e.post as PostDto;
          upsertPost(qc, post);
          if (e.created && post.cardId) bumpCardCount(qc, lectureId, post.cardId, post.tab, 1, post.createdAt);
          break;
        }
        case "post.remove":
          removePost(qc, e.postId as string);
          if (e.cardId) bumpCardCount(qc, lectureId, e.cardId as string, e.tab as string, -1);
          break;
        case "post.move":
          void qc.invalidateQueries({ queryKey: ["posts", e.cardId] });
          break;
        case "comment.upsert":
          upsertComment(qc, e.comment as CommentDto, e.commentCount as number);
          break;
        case "comment.remove":
          removeComment(qc, e.postId as string, e.commentId as string, e.commentCount as number);
          break;
        case "like.update":
          patchPost(qc, e.postId as string, (p) => ({ ...p, likeCount: e.count as number, instructorLiked: e.instructorLiked as boolean }));
          break;
        case "participant.update":
          renameEverywhere(qc, e.publicId as string, e.nickname as string);
          break;
        case "notify":
          toast(e.kind === "instructor_comment" ? "강사님이 내 글에 댓글을 달았어요." : "강사님이 내 글에 좋아요를 눌렀어요.", {
            action: e.cardId ? { label: "보기", run: go(`/c/${e.cardId as string}/p/${e.postId as string}`) } : undefined,
          });
          break;
        case "course.update":
          void qc.invalidateQueries({ queryKey: ["course"] });
          break;
        case "presence":
          setPresence({ count: e.count as number, participants: e.participants as Presence["participants"] });
          break;
      }
    },
  });

  return { ...presence, connected };
}

function renameEverywhere(qc: ReturnType<typeof useQueryClient>, publicId: string, nickname: string) {
  const fix = (post: PostDto): PostDto => ({
    ...post,
    author: post.author.publicId === publicId ? { ...post.author, name: nickname } : post.author,
    recentComments: post.recentComments.map((c) => (c.author.publicId === publicId ? { ...c, author: { ...c.author, name: nickname } } : c)),
  });
  qc.setQueriesData<{ posts: PostDto[] }>({ queryKey: ["posts"] }, (data) => (data ? { posts: data.posts.map(fix) } : data));
  qc.setQueriesData<{ post: PostDto }>({ queryKey: ["post"] }, (data) => (data ? { post: fix(data.post) } : data));
  qc.setQueriesData<{ comments: CommentDto[] }>({ queryKey: ["comments"] }, (data) =>
    data ? { comments: data.comments.map((c) => (c.author.publicId === publicId ? { ...c, author: { ...c.author, name: nickname } } : c)) } : data,
  );
}
