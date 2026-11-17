import { Maximize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HelpItem } from "./HelpPanel";
import { iceServers } from "./rtc";

export type RtcMessage = { type: string; helpId?: string; from?: string; data?: unknown };

const CONNECT_TIMEOUT_MS = 20_000;

/** 옆 패널에서는 작아서, 브라우저 전체 화면으로 크게 본다. Esc로 돌아온다. iPad Safari는 동영상 전용 전체 화면을 쓴다 */
function enlarge(v: HTMLVideoElement | null) {
  if (!v) return;
  if (v.requestFullscreen) void v.requestFullscreen().catch(() => undefined);
  else (v as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
}

/** 강사가 수강생 화면을 본다. 한 번에 한 명만 (plan.md 13.1). */
export function LiveViewer({
  item,
  subscribe,
  send,
  onDone,
  onRequestScreenshot,
}: {
  item: HelpItem;
  subscribe: (fn: (m: RtcMessage) => void) => void;
  send: (m: Record<string, unknown>) => void;
  onDone: () => void;
  onRequestScreenshot: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    const queued: RTCIceCandidateInit[] = [];
    let closed = false;
    const timer = setTimeout(() => setFailed(true), CONNECT_TIMEOUT_MS);
    const to = item.participant.publicId;
    const helpId = item.id;

    async function onOffer(offer: RTCSessionDescriptionInit) {
      pc?.close();
      const peer = new RTCPeerConnection({ iceServers: await iceServers() });
      if (closed) return peer.close();
      pc = peer;
      peer.ontrack = (e) => {
        if (video.current) video.current.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      };
      peer.onicecandidate = (e) => {
        if (e.candidate) send({ type: "rtc.ice", helpId, to, data: e.candidate.toJSON() });
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          clearTimeout(timer);
          setFailed(false);
        }
        if (peer.connectionState === "failed") setFailed(true);
      };
      await peer.setRemoteDescription(offer);
      for (const c of queued.splice(0)) await peer.addIceCandidate(c);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      send({ type: "rtc.answer", helpId, to, data: answer });
    }

    subscribe((m) => {
      if (m.helpId !== helpId) return;
      if (m.type === "rtc.offer") void onOffer(m.data as RTCSessionDescriptionInit).catch(() => setFailed(true));
      if (m.type === "rtc.ice") {
        if (pc?.remoteDescription) void pc.addIceCandidate(m.data as RTCIceCandidateInit);
        else queued.push(m.data as RTCIceCandidateInit);
      }
    });

    return () => {
      closed = true;
      clearTimeout(timer);
      subscribe(() => undefined);
      pc?.close();
    };
    // 보는 사람이 바뀔 때만 다시 연결한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <section className="border-b border-line p-3" aria-label={`${item.participant.nickname} 화면`} data-testid="live-viewer">
      <div className="mb-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold">{item.participant.nickname}님의 화면</p>
        {playing && (
          <button className="btn btn-quiet btn-sm" onClick={() => enlarge(video.current)}>
            <Maximize2 size={16} strokeWidth={2.25} />
            크게 보기
          </button>
        )}
      </div>
      <video ref={video} autoPlay playsInline muted controls={false} onDoubleClick={() => enlarge(video.current)} title="두 번 누르면 크게 보여요" className="w-full rounded-control bg-black object-contain" aria-label={`${item.participant.nickname}님의 화면`} onPlaying={() => setPlaying(true)} data-playing={playing} data-testid="live-video" />
      {!playing && !failed && <p className="mt-2 text-sm text-muted">연결하는 중이에요.</p>}
      {failed && !playing && (
        <div className="mt-2 space-y-2" role="alert">
          <p>연결이 안 돼요. 스크린샷을 요청해 보세요.</p>
          <button className="btn btn-primary w-full" onClick={onRequestScreenshot}>
            스크린샷 요청
          </button>
        </div>
      )}
      <button className="btn btn-ghost mt-2 w-full" onClick={onDone}>
        확인함
      </button>
    </section>
  );
}
