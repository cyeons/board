import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { api, errorText, unwrap } from "../../lib/api";
import { canCaptureScreen } from "../../lib/device";
import { objectUrl } from "../../lib/image";
import { toast } from "../../lib/toast";
import { tooLargeMessage, uploadFile } from "../../lib/upload";

const MB = 1024 * 1024;

/** 화면 선택 창에서 고른 화면을 한 장 찍는다. */
async function captureOnce(): Promise<File> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    if (!video.videoWidth) await new Promise((r) => video.addEventListener("loadedmetadata", r, { once: true }));
    // 화면 선택 직후의 첫 프레임이 비어 있는 브라우저가 있어 한 프레임 기다린다
    await new Promise((r) => requestAnimationFrame(r));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) throw new Error("capture failed");
    return new File([blob], `스크린샷 ${new Date().toLocaleTimeString("ko-KR")}.jpg`, { type: "image/jpeg" });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

export default function ScreenshotDialog({ lectureId, onClose }: { lectureId: string; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? objectUrl(file) : null), [file]);
  const canCapture = canCaptureScreen();

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function capture() {
    setError("");
    try {
      setFile(await captureOnce());
    } catch (e) {
      if ((e as DOMException).name !== "NotAllowedError") setError("화면을 찍지 못했어요. 사진 파일을 골라 주세요.");
    }
  }

  function pick(picked: File | undefined) {
    if (!picked) return;
    setError("");
    if (!picked.type.startsWith("image/") && !/\.(heic|heif)$/i.test(picked.name)) return setError("사진 파일을 골라 주세요.");
    setFile(picked);
  }

  async function send() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const { fileId } = await uploadFile(file, { lectureId, category: "screenshot" });
      await unwrap(api.help.screenshot.$post({ json: { lectureId, fileId, message: message.trim() || null } }));
      toast("강사님께 보냈어요.");
      onClose();
    } catch (e) {
      setError(errorText(e).includes("MB") ? tooLargeMessage("screenshot") : errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="스크린샷 보내기" onFiles={busy ? undefined : (files) => pick(files[0])}>
      <div className="space-y-4">
        <input ref={input} type="file" accept="image/*" className="sr-only" aria-label="스크린샷 사진 고르기" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
        {!file && (
          <div className="space-y-2">
            {canCapture && (
              <button className="btn btn-primary w-full" onClick={() => void capture()}>
                지금 화면 찍기
              </button>
            )}
            <button className={`btn w-full ${canCapture ? "btn-ghost" : "btn-primary"}`} onClick={() => input.current?.click()}>
              앨범에서 고르기
            </button>
            <p className="text-sm text-muted">{canCapture ? "화면 선택 창이 뜨면 보여줄 창을 골라 주세요." : "기기로 찍어 둔 스크린샷을 골라 주세요."}</p>
          </div>
        )}
        {file && preview && (
          <>
            <img src={preview} alt="보낼 스크린샷 미리보기" className="max-h-[40dvh] w-full rounded-control border border-line object-contain" data-testid="shot-preview" />
            <p className="rounded-control bg-accent-soft p-3">강사님만 볼 수 있어요. 개인 정보가 보이지 않는지 확인해 주세요.</p>
            <div>
              <label htmlFor="shot-message" className="mb-1 block font-medium">
                메시지 (선택)
              </label>
              <input id="shot-message" className="field" maxLength={200} placeholder="예: 여기서 오류가 나요" value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost" disabled={busy} onClick={() => setFile(null)}>
                다시 고르기
              </button>
              <button className="btn btn-primary flex-1" disabled={busy || file.size > 50 * MB} onClick={() => void send()}>
                {busy ? "보내는 중이에요" : "보내기"}
              </button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
