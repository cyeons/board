import { useState } from "react";
import { useNavigate } from "react-router";
import { Avatar, InstructorBadge } from "../../components/ui/Avatar";
import { Menu } from "../../components/ui/Menu";
import { Confirm, Modal } from "../../components/ui/Modal";
import { api, errorText, unwrap } from "../../lib/api";
import { clearToken, saveNickname } from "../../lib/identity";
import { toastError } from "../../lib/toast";
import { useCourse } from "./course";

export function NameChip() {
  const { me, setMe, course, groups, loggedIn } = useCourse();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<"nickname" | "group" | null>(null);
  const [nickname, setNickname] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);

  if (loggedIn) {
    return (
      <button className="press chip surface min-h-11 py-1 pr-3 pl-1.5 text-sm" onClick={() => void navigate(`/admin/c/${encodeURIComponent(course.slug)}`)} aria-label="과정 관리로 가기">
        <Avatar name={course.instructorName} color={0} size={30} instructor />
        <span className="max-w-24 truncate">{course.instructorName}</span>
        <InstructorBadge />
      </button>
    );
  }
  if (!me) return null;

  // 바꾼 이름과 모둠을 바로 보여 주고, 서버가 거절하면 되돌리고 창을 다시 연다
  async function save() {
    const before = me!;
    const which = editing;
    setError("");
    setMe(which === "nickname" ? { ...before, nickname: nickname.trim() } : { ...before, groupId });
    setEditing(null);
    try {
      const res = await unwrap(api.me.$patch({ json: which === "nickname" ? { nickname } : { groupId } }));
      setMe(res.participant);
    } catch (e) {
      setMe(before);
      setError(errorText(e));
      setEditing(which);
    }
  }

  async function leave() {
    try {
      await unwrap(api.me.leave.$post());
      clearToken(course.id);
      // 공용 기기에서 다음 사람에게 앞사람 이름이 뜨지 않게 지운다
      saveNickname(null);
      setMe(null);
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <>
      <Menu
        label={`${me.nickname} 메뉴`}
        triggerClassName="press chip surface min-h-11 py-1 pr-3.5 pl-1.5 text-sm"
        items={[
            {
              label: "닉네임 바꾸기",
              onSelect: () => {
                setNickname(me.nickname);
                setError("");
                setEditing("nickname");
              },
            },
            ...(groups.length
              ? [
                  {
                    label: "모둠 바꾸기",
                    onSelect: () => {
                      setGroupId(me.groupId);
                      setError("");
                      setEditing("group");
                    },
                  },
                ]
              : []),
            { label: "다른 사람으로 입장하기", onSelect: () => setLeaving(true) },
          ]}
      >
        <Avatar name={me.nickname} color={me.avatarColor} size={30} />
        <span className="max-w-24 truncate">{me.nickname}</span>
      </Menu>
      <Confirm open={leaving} onOpenChange={setLeaving} title="다른 사람으로 입장하기" confirmLabel="나가기" onConfirm={() => void leave().finally(() => setLeaving(false))}>
        <p>
          지금 <strong>{me.nickname}</strong>(으)로 쓴 글과 댓글은 남지만, 나가면 이 기기에서 다시 고치거나 지울 수 없어요.
        </p>
      </Confirm>
      <Modal open={editing !== null} onOpenChange={(v) => !v && setEditing(null)} title={editing === "nickname" ? "닉네임 바꾸기" : "모둠 바꾸기"}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {editing === "nickname" ? (
            <>
              <input className="field" aria-label="새 닉네임" required minLength={2} maxLength={12} value={nickname} onChange={(e) => setNickname(e.target.value)} />
              <p className="text-sm text-muted">이전에 쓴 글과 댓글에도 새 닉네임이 보여요.</p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <label key={g.id} className={`btn btn-sm ${groupId === g.id ? "btn-primary" : "btn-quiet"} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent`}>
                    <input type="radio" name="group-change" className="sr-only" checked={groupId === g.id} onChange={() => setGroupId(g.id)} />
                    {g.name}
                  </label>
                ))}
              </div>
              <p className="text-sm text-muted">이전에 쓴 글은 원래 모둠 칼럼에 남아요.</p>
            </>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <button className="btn btn-primary w-full">저장</button>
        </form>
      </Modal>
    </>
  );
}
