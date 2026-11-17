import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Hand, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { api, unwrap } from "../../lib/api";
import { keys } from "../../lib/cache";
import { useFileUrl } from "../../lib/files";
import { timeAgo } from "../../lib/format";
import { readStore, writeStore } from "../../lib/identity";
import { fade, sheetSpring, spring } from "../../lib/motion";
import { useSocket } from "../../lib/realtime";
import { toast, toastError } from "../../lib/toast";
import { LiveViewer, type RtcMessage } from "./LiveViewer";

export type HelpItem = {
  id: string;
  kind: "screenshot" | "live";
  message: string | null;
  fileId: string | null;
  status: "waiting" | "viewing" | "done";
  createdAt: number;
  participant: { publicId: string; nickname: string; groupId: string | null };
};

type Data = { requests: HelpItem[] };

const MUTE_KEY = "board:help-muted";

/** 알림음. 짧게 두 번 울린다. 브라우저가 소리를 막으면 조용히 넘어간다. */
function beep() {
  try {
    const ctx = new AudioContext();
    for (const [i, freq] of [880, 1175].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.16);
      osc.stop(ctx.currentTime + i * 0.16 + 0.12);
    }
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // 소리가 없어도 화면 알림은 뜬다
  }
}

function Shot({ fileId, onOpen, name }: { fileId: string; onOpen: () => void; name: string }) {
  const url = useFileUrl(fileId, "thumb");
  return (
    <button className="mt-2 block w-full overflow-hidden rounded-control border border-line bg-accent-soft" aria-label={`${name} 스크린샷 크게 보기`} onClick={onOpen}>
      {url && <img src={url} alt="" className="max-h-40 w-full object-contain" data-testid="help-thumb" />}
    </button>
  );
}

function BigShot({ fileId, onClose }: { fileId: string; onClose: () => void }) {
  const url = useFileUrl(fileId, "inline");
  return (
    <Modal open wide onOpenChange={(v) => !v && onClose()} title="스크린샷">
      {url && <img src={url} alt="수강생이 보낸 스크린샷" className="w-full" data-testid="help-big" />}
    </Modal>
  );
}

export default function HelpPanel({ courseId, groups }: { courseId: string; groups: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(() => readStore(MUTE_KEY) === "1");
  const [viewing, setViewing] = useState<HelpItem | null>(null);
  const [big, setBig] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const rtcHandler = useRef<((m: RtcMessage) => void) | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const announced = useRef(false);
  const key = keys.help(courseId);

  const list = useQuery({ queryKey: key, queryFn: () => unwrap(api.admin.courses[":id"].help.$get({ param: { id: courseId } })) as Promise<Data> });
  const requests = list.data?.requests ?? [];
  const waiting = requests.filter((r) => r.status !== "done");

  // 강사가 없을 때 온 요청은 들어왔을 때 알림음과 함께 보여 준다 (plan.md 6.6)
  useEffect(() => {
    if (list.data && !announced.current) {
      announced.current = true;
      if (waiting.length) {
        if (!mutedRef.current) beep();
        toast(`기다리는 도움 요청이 ${waiting.length}개 있어요.`);
      }
    }
  }, [list.data, waiting.length]);

  useSocket({
    kind: "help",
    id: courseId,
    enabled: true,
    onConnected: (ws) => {
      socket.current = ws;
    },
    onReconnect: () => void qc.invalidateQueries({ queryKey: key }),
    onMessage: (e) => {
      if (e.type === "help.new") {
        const item = e.request as HelpItem;
        qc.setQueryData<Data>(key, (d) => (d && !d.requests.some((r) => r.id === item.id) ? { requests: [...d.requests, item] } : d));
        if (!mutedRef.current) beep();
        toast(`${item.participant.nickname}님이 ${item.kind === "live" ? "화면을 보여주려고 해요" : "스크린샷을 보냈어요"}.`);
      } else if (e.type === "help.update") {
        qc.setQueryData<Data>(key, (d) => (d ? { requests: d.requests.map((r) => (r.id === e.id ? { ...r, status: e.status as HelpItem["status"] } : r)) } : d));
        if (e.status === "done") setViewing((v) => (v?.id === e.id ? null : v));
      } else if (e.type.startsWith("rtc.")) {
        rtcHandler.current?.(e as unknown as RtcMessage);
      }
    },
  });

  // 패널이 열리면 카드 상세도 왼쪽으로 밀린다
  useEffect(() => {
    const width = !open ? "0px" : viewing ? "640px" : "360px";
    const apply = () => document.documentElement.style.setProperty("--panel-width", window.innerWidth >= 1024 ? width : "0px");
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--panel-width");
    };
  }, [open, viewing]);

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "모둠 없음";

  async function setStatus(item: HelpItem, status: "viewing" | "done") {
    try {
      await unwrap(api.admin.help[":id"].$patch({ param: { id: item.id }, json: { status } }));
      qc.setQueryData<Data>(key, (d) => (d ? { requests: d.requests.map((r) => (r.id === item.id ? { ...r, status } : status === "viewing" && r.status === "viewing" ? { ...r, status: "done" } : r)) } : d));
      if (status === "viewing") setViewing({ ...item, status });
      else if (viewing?.id === item.id) setViewing(null);
    } catch (e) {
      toastError(e);
    }
  }

  const done = requests.filter((r) => r.status === "done").reverse();
  const sorted = showDone ? [...waiting, ...done] : waiting;

  const slideIn = reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } };

  return (
    <AnimatePresence initial={false}>
      {!open ? (
        <motion.button
          key="tab"
          {...slideIn}
          transition={reduced ? fade : sheetSpring}
          className="press fixed top-1/2 right-0 z-[46] flex min-h-14 -translate-y-1/2 items-center gap-1.5 rounded-l-[20px] bg-accent py-3 pr-3 pl-3.5 text-on-accent shadow-raised"
          aria-label={`도움 요청함 열기, 대기 ${waiting.length}개`}
          onClick={() => setOpen(true)}
          data-testid="help-tab"
        >
          <Hand size={18} strokeWidth={2} aria-hidden />
          <span className="font-bold" data-testid="help-count">
            {waiting.length}
          </span>
        </motion.button>
      ) : (
        <motion.aside
          key="panel"
          {...slideIn}
          transition={reduced ? fade : sheetSpring}
          aria-label="도움 요청함"
          className="fixed inset-y-0 right-0 z-[46] flex w-full flex-col bg-surface shadow-raised lg:w-[var(--panel-width)]"
          data-testid="help-panel"
        >
          <header className="flex min-h-14 items-center gap-1 px-3 pt-[var(--safe-top)]">
            <h2 className="min-w-0 flex-1 pl-1 text-lg font-bold">도움 요청함 {waiting.length > 0 && <span className="chip bg-accent text-on-accent">{waiting.length}</span>}</h2>
            <button
              className="icon-btn"
              aria-label={muted ? "알림음 켜기" : "알림음 끄기"}
              aria-pressed={muted}
              onClick={() => {
                writeStore(MUTE_KEY, muted ? null : "1");
                setMuted(!muted);
              }}
            >
              {muted ? <VolumeX size={20} strokeWidth={1.75} /> : <Volume2 size={20} strokeWidth={1.75} />}
            </button>
            <button className="icon-btn" aria-label="도움 요청함 접기" onClick={() => setOpen(false)}>
              <ChevronRight size={20} strokeWidth={1.75} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {viewing && (
              <LiveViewer
                key={viewing.id}
                item={viewing}
                subscribe={(fn) => {
                  rtcHandler.current = fn;
                }}
                send={(m) => socket.current?.send(JSON.stringify(m))}
                onDone={() => void setStatus(viewing, "done")}
                onRequestScreenshot={() => {
                  void unwrap(api.admin.help[":id"]["request-screenshot"].$post({ param: { id: viewing.id } }))
                    .then(() => toast(`${viewing.participant.nickname}님에게 스크린샷을 부탁했어요.`))
                    .catch(toastError);
                }}
              />
            )}
            {waiting.length === 0 && <p className="p-6 text-center text-muted">{done.length ? "기다리는 도움 요청이 없어요." : "아직 도움 요청이 없어요."}</p>}
            <ul className="space-y-2 p-3">
              {sorted.map((item) => (
                <motion.li
                  layout={!reduced}
                  transition={spring}
                  key={item.id}
                  className={`rounded-post bg-fill p-4 transition-opacity ${item.status === "done" ? "opacity-50" : ""}`} data-testid="help-item" data-kind={item.kind} data-status={item.status}>
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="text-base font-semibold">{item.participant.nickname}</span>
                    <span className="text-muted">{groupName(item.participant.groupId)}</span>
                    <span className="text-muted">{timeAgo(item.createdAt)}</span>
                  </p>
                  {item.message && <p className="mt-1">{item.message}</p>}
                  {item.kind === "screenshot" && item.fileId && <Shot fileId={item.fileId} name={item.participant.nickname} onOpen={() => setBig(item.fileId)} />}
                  {item.kind === "screenshot" && !item.fileId && <p className="mt-1 text-sm text-muted">스크린샷을 지웠어요.</p>}
                  {item.status !== "done" && (
                    <div className="mt-2 flex gap-2">
                      {item.kind === "live" && viewing?.id !== item.id && (
                        <button className="btn btn-primary flex-1" aria-label={`${item.participant.nickname} 화면 보기`} onClick={() => void setStatus(item, "viewing")}>
                          보기
                        </button>
                      )}
                      <button className="btn btn-ghost flex-1" onClick={() => void setStatus(item, "done")}>
                        확인함
                      </button>
                    </div>
                  )}
                </motion.li>
              ))}
            </ul>
            {done.length > 0 && (
              <button className="btn btn-quiet btn-sm mx-3 mb-3" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
                {showDone ? "처리한 요청 접기" : `처리함 ${done.length}개 보기`}
              </button>
            )}
          </div>
          {big && <BigShot fileId={big} onClose={() => setBig(null)} />}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
