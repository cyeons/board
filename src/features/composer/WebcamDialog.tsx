import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";

/** 컴퓨터의 웹캠으로 한 장 찍는다. */
export function WebcamDialog({ onClose, onShot }: { onClose: () => void; onShot: (file: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let alive = true;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError("카메라를 쓸 수 없어요. 브라우저 권한을 확인하거나 사진 파일을 올려 주세요."));
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function shoot() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onShot(new File([blob], `촬영 ${new Date().toLocaleTimeString("ko-KR")}.jpg`, { type: "image/jpeg" }));
        onClose();
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="웹캠으로 찍기">
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <div className="space-y-3">
          <video ref={video} autoPlay playsInline muted className="w-full rounded-control bg-black" aria-label="웹캠 화면" />
          <button className="btn btn-primary w-full" onClick={shoot}>
            찍기
          </button>
        </div>
      )}
    </Modal>
  );
}
