import * as Dialog from "@radix-ui/react-dialog";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { shareUrl } from "../../lib/brand";

/** 입장 QR을 전체 화면으로 띄운다. 주소는 링크 복사와 같은 읽을 수 있는 형태다 (plan.md 4.3). */
export default function QrFullscreen({ slug, title, onClose }: { slug: string; title: string; onClose: () => void }) {
  const [src, setSrc] = useState("");
  const address = shareUrl(slug);
  useEffect(() => {
    void QRCode.toDataURL(`https://${address}`, { width: 720, margin: 1, color: { dark: "#17293b" } }).then(setSrc);
  }, [address]);
  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Content aria-describedby={undefined} className="enter-zoom fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-surface p-6 outline-none" data-testid="qr">
          <Dialog.Title className="text-2xl font-bold">{title}</Dialog.Title>
          {src && <img src={src} alt={`${address} 입장 QR`} className="aspect-square max-h-[70dvh] w-full max-w-[70dvh]" />}
          <p className="text-xl font-semibold">{address}</p>
          <Dialog.Close className="btn btn-quiet">닫기 (Esc)</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
