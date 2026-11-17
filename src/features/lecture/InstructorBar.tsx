import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, QrCode, Square, Users } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Switch } from "../../components/ui/Switch";
import { api, unwrap } from "../../lib/api";
import { keys } from "../../lib/cache";
import { isMobileDevice } from "../../lib/device";
import type { Presence } from "../../lib/realtime";
import { toastError } from "../../lib/toast";
import { useCourse } from "../entry/course";

const QrFullscreen = lazy(() => import("./QrFullscreen"));

type Props = {
  lecture: { id: string; status: string };
  presence: Presence & { connected: boolean };
  editing: boolean;
  setEditing: (v: boolean) => void;
};

export function InstructorBar({ lecture, presence, editing, setEditing }: Props) {
  const { course, groups, studentView, setStudentView } = useCourse();
  const qc = useQueryClient();
  const [showPeople, setShowPeople] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.lecture(lecture.id) });

  const toggle = useMutation({
    mutationFn: async () => {
      if (lecture.status === "open") await unwrap(api.admin.lectures[":id"].close.$post({ param: { id: lecture.id } }));
      else await unwrap(api.admin.lectures[":id"].open.$post({ param: { id: lecture.id } }));
    },
    onSuccess: refresh,
    onError: toastError,
  });

  const byGroup = [...groups.map((g) => ({ id: g.id as string | null, name: g.name })), { id: null, name: "미지정" }]
    .map((g) => ({ ...g, people: presence.participants.filter((p) => (p.groupId ?? null) === g.id) }))
    .filter((g) => g.people.length > 0);

  // 휴대폰과 태블릿에서는 시작과 종료, 도움 요청함만 쓴다 (plan.md 6.1)
  const compact = isMobileDevice();

  return (
    // 화면 아래에 떠 있는 도구 막대. 위쪽 헤더와 겹치지 않고, 스크롤해도 늘 손이 닿는다.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(16px+var(--safe-bottom))] z-30 flex flex-col items-center gap-2 px-[var(--gutter)]">
      {!presence.connected && <p className="rounded-full bg-ink/85 px-3 py-1 text-sm font-medium text-on-accent">연결이 끊겨 다시 연결하는 중이에요.</p>}
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-[28px] bg-surface/95 p-1.5 shadow-raised backdrop-blur-xl" role="toolbar" aria-label="강사 도구">
        <button className={`btn btn-sm ${lecture.status === "open" ? "btn-danger" : "btn-primary"}`} aria-busy={toggle.isPending} onClick={() => toggle.mutate()}>
          {lecture.status === "open" ? <Square size={16} strokeWidth={2.25} /> : <Play size={16} strokeWidth={2.25} />}
          {lecture.status === "open" ? "종료" : lecture.status === "closed" ? "다시 열기" : "시작"}
        </button>
        {!compact && (
          <>
            <button className="btn btn-quiet btn-sm" onClick={() => setShowPeople(true)} data-testid="presence">
              <Users size={16} strokeWidth={2.25} />
              지금 {presence.count}명 접속 중
            </button>
            <button className="btn btn-quiet btn-sm" onClick={() => setShowQr(true)}>
              <QrCode size={16} strokeWidth={2.25} />
              입장 QR
            </button>
            <span className="px-1">
              <Switch checked={studentView} onCheckedChange={(v) => { setStudentView(v); if (v) setEditing(false); }} label="수강생으로 보기" showLabel />
            </span>
            <span className="pr-2">
              <Switch checked={editing} onCheckedChange={setEditing} label="편집" showLabel />
            </span>
          </>
        )}
      </div>
      <Modal open={showPeople} onOpenChange={setShowPeople} title={`접속 중 ${presence.count}명`}>
        {byGroup.length === 0 && <p className="text-muted">아직 들어온 수강생이 없어요.</p>}
        {byGroup.map((g) => (
          <section key={g.name} className="mb-3">
            <h3 className="font-bold">
              {g.name} {g.people.length}명
            </h3>
            <p className="text-muted">{g.people.map((p) => p.nickname).join(", ")}</p>
          </section>
        ))}
      </Modal>
      {showQr && (
        <Suspense fallback={null}>
          <QrFullscreen slug={course.slug} title={course.title} onClose={() => setShowQr(false)} />
        </Suspense>
      )}
    </div>
  );
}
