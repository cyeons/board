import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { api, unwrap } from "../../lib/api";
import { useSocket } from "../../lib/realtime";
import { toast, toastError } from "../../lib/toast";
import { useCourse } from "../entry/course";
import { iceServers, sendScreen } from "./rtc";

type Phase = "guide" | "connecting" | "waiting" | "viewing";

/** 수강생의 실시간 화면 공유. 강사가 보기를 누르면 연결된다 (plan.md 13.1). */
export default function LiveShare({ lectureId, onClose, onRequestScreenshot }: { lectureId: string; onClose: () => void; onRequestScreenshot: () => void }) {
  const { course } = useCourse();
  const [phase, setPhase] = useState<Phase>("guide");
  const stream = useRef<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const helpId = useRef<string | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);

  const closePeer = () => {
    pc.current?.close();
    pc.current = null;
    pendingIce.current = [];
  };

  const finish = (message?: string) => {
    closePeer();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (message) toast(message);
    onClose();
  };

  async function register() {
    const { request } = await unwrap(api.help.live.$post({ json: { lectureId } }));
    helpId.current = request.id;
    setPhase((p) => (p === "viewing" ? p : "waiting"));
  }

  async function startPeer(id: string) {
    if (!stream.current) return;
    closePeer();
    const peer = new RTCPeerConnection({ iceServers: await iceServers() });
    pc.current = peer;
    peer.onicecandidate = (e) => {
      if (e.candidate) ws.current?.send(JSON.stringify({ type: "rtc.ice", helpId: id, data: e.candidate.toJSON() }));
    };
    await sendScreen(peer, stream.current);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    ws.current?.send(JSON.stringify({ type: "rtc.offer", helpId: id, data: offer }));
    setPhase("viewing");
  }

  const connected = useSocket({
    kind: "help",
    id: course.id,
    enabled: phase !== "guide",
    onConnected: (socket) => {
      ws.current = socket;
      if (socket && !helpId.current) void register().catch(() => finish("요청을 보내지 못했어요. 스크린샷으로 보내 주세요."));
    },
    // 연결이 끊기면 서버가 요청을 끝내므로, 다시 붙으면 대기열에 다시 들어간다
    onReconnect: () => {
      helpId.current = null;
      closePeer();
      setPhase("waiting");
      void register().catch(toastError);
    },
    onMessage: (e) => {
      if (e.helpId && helpId.current && e.helpId !== helpId.current) return;
      switch (e.type) {
        case "rtc.start":
          void startPeer(e.helpId as string).catch(() => toast("연결하지 못했어요. 다시 시도해 주세요.", { tone: "error" }));
          break;
        case "rtc.answer":
          void pc.current?.setRemoteDescription(e.data as RTCSessionDescriptionInit).then(async () => {
            for (const c of pendingIce.current.splice(0)) await pc.current?.addIceCandidate(c);
          });
          break;
        case "rtc.ice":
          if (pc.current?.remoteDescription) void pc.current.addIceCandidate(e.data as RTCIceCandidateInit);
          else pendingIce.current.push(e.data as RTCIceCandidateInit);
          break;
        case "rtc.end":
          finish("강사님이 화면 보기를 끝냈어요.");
          break;
        case "help.request_screenshot":
          onRequestScreenshot();
          break;
      }
    },
  });

  async function begin() {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      stream.current = s;
      // 브라우저의 "공유 중지"를 눌러도 끝낸다
      s.getVideoTracks()[0]?.addEventListener("ended", () => void stop());
      setPhase("connecting");
    } catch (e) {
      if ((e as DOMException).name === "NotAllowedError") onClose();
      else finish("화면을 고르지 못했어요. 스크린샷으로 보내 주세요.");
    }
  }

  async function stop() {
    const id = helpId.current;
    if (id) await unwrap(api.help.live[":id"].$delete({ param: { id } })).catch(() => undefined);
    finish();
  }

  // 화면을 벗어나면 공유를 멈춘다
  useEffect(
    () => () => {
      closePeer();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  if (phase === "guide") {
    return (
      <Modal open onOpenChange={(v) => !v && onClose()} title="화면 보여주기">
        <p className="mb-2">강사님께 내 화면을 실시간으로 보여줘요. 소리는 전달되지 않고, 강사님은 보기만 해요.</p>
        <p className="mb-4 rounded-control bg-accent-soft p-3">전체 화면보다 창 하나만 고르기를 권해요. 개인 정보가 보이지 않는지 확인해 주세요.</p>
        <button className="btn btn-primary w-full" onClick={() => void begin()}>
          화면 고르기
        </button>
      </Modal>
    );
  }

  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[65] flex flex-wrap items-center justify-center gap-3 bg-accent-soft px-4 py-2 shadow-base" data-testid="share-banner">
      <span className="font-semibold">{phase === "viewing" ? "강사님이 보고 있어요" : "강사님이 확인하면 연결돼요"}</span>
      {!connected && <span className="text-sm text-muted">다시 연결하는 중이에요.</span>}
      <button className="btn btn-sm min-h-11 bg-surface text-accent-ink" onClick={() => void stop()}>
        중지
      </button>
    </div>
  );
}
