import { Hand } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { useLocation } from "react-router";
import { FabLabel } from "../../components/ui/FabLabel";
import { Menu } from "../../components/ui/Menu";
import { Modal } from "../../components/ui/Modal";
import { canCaptureScreen, isInApp, isMobileDevice } from "../../lib/device";
import { useFabCollapsed } from "../../lib/fab";
import { toast } from "../../lib/toast";

const ScreenshotDialog = lazy(() => import("./ScreenshotDialog"));
const LiveShare = lazy(() => import("./LiveShare"));

/** 수강생의 도움 요청 버튼. + 버튼 위에 있고, 화면 공유 기능은 누를 때만 불러온다. */
export function HelpButton({ lectureId }: { lectureId: string }) {
  const { pathname } = useLocation();
  const onCard = pathname.includes("/c/");
  const collapsed = useFabCollapsed();
  const [shot, setShot] = useState(false);
  const [live, setLive] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  function startLive() {
    if (isInApp()) return setBlocked("이 앱 안에서는 화면을 보여줄 수 없어요. 오른쪽 위 메뉴에서 Chrome이나 Safari로 열어 주세요. 다른 브라우저로 옮기면 새 사람으로 입장하게 돼요.");
    if (isMobileDevice()) return setBlocked("이 기기에서는 스크린샷으로 보내 주세요.");
    if (!canCaptureScreen()) return setBlocked("이 브라우저는 화면 공유를 지원하지 않아요. 스크린샷으로 보내 주세요.");
    setLive(true);
  }

  return (
    <>
      <div className={`fixed right-[max(20px,env(safe-area-inset-right))] z-[45] ${onCard ? "bottom-[calc(max(20px,env(safe-area-inset-bottom))+68px)]" : "bottom-[max(20px,env(safe-area-inset-bottom))]"}`}>
        <Menu
          label="도움 요청"
          triggerClassName={`press surface flex min-h-12 items-center rounded-full px-3.5 font-semibold transition-[gap] duration-(--duration-base) ${collapsed ? "gap-0" : "gap-1.5"}`}
          items={[
            { label: "스크린샷 보내기", onSelect: () => setShot(true) },
            { label: "화면 보여주기", onSelect: startLive },
          ]}
        >
          <Hand size={20} strokeWidth={2} className="text-accent-ink" aria-hidden />
          <FabLabel collapsed={collapsed}>도움 요청</FabLabel>
        </Menu>
      </div>
      <Suspense fallback={null}>
        {shot && <ScreenshotDialog lectureId={lectureId} onClose={() => setShot(false)} />}
        {live && (
          <LiveShare
            lectureId={lectureId}
            onClose={() => setLive(false)}
            onRequestScreenshot={() => {
              toast("강사님이 스크린샷을 부탁했어요.", { action: { label: "보내기", run: () => setShot(true) }, ms: 15000 });
            }}
          />
        )}
      </Suspense>
      <Modal open={blocked !== null} onOpenChange={(v) => !v && setBlocked(null)} title="화면 보여주기">
        <p className="mb-4">{blocked}</p>
        <button
          className="btn btn-primary w-full"
          onClick={() => {
            setBlocked(null);
            setShot(true);
          }}
        >
          스크린샷 보내기
        </button>
      </Modal>
    </>
  );
}

