import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { type FormEvent, Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { DotsMenu } from "../../components/ui/Menu";
import { Confirm, Modal } from "../../components/ui/Modal";
import { Switch } from "../../components/ui/Switch";
import { api, errorText, unwrap } from "../../lib/api";
import { todayKst } from "../../lib/format";
import { toast, toastError } from "../../lib/toast";
import { maxBytes, tooLargeMessage, uploadFile } from "../../lib/upload";
import { AdminFrame } from "./AdminFrame";
import { shareUrl } from "../../lib/brand";
import { DuplicateCourse, SlugField, copyShareLink, useSlugCheck } from "./AdminHome";
import { BackupButtons } from "./backup";

const HelpPanel = lazy(() => import("../help/HelpPanel"));

type LectureRow = { id: string; date: string; startTime: string; title: string; description: string; coverFileId: string | null; published: boolean; status: string; cardCount: number };

const STATUS: Record<string, string> = { before: "시작 전", open: "진행 중", closed: "종료" };

function LectureForm({ courseId, lecture, onClose }: { courseId: string; lecture: LectureRow | "new"; onClose: () => void }) {
  const existing = lecture === "new" ? null : lecture;
  const [date, setDate] = useState(existing?.date ?? todayKst());
  const [startTime, setStartTime] = useState(existing?.startTime ?? "09:00");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [published, setPublished] = useState(existing?.published ?? false);
  const [coverFileId, setCoverFileId] = useState(existing?.coverFileId ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: async () => {
      const json = { date, startTime, title, description, published, coverFileId };
      if (existing) await unwrap(api.admin.lectures[":id"].$patch({ param: { id: existing.id }, json }));
      else await unwrap(api.admin.courses[":id"].lectures.$post({ param: { id: courseId }, json }));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "course"] });
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });

  async function pickCover(file: File) {
    if (file.size > maxBytes("cover")) return setError(tooLargeMessage("cover"));
    setUploading(true);
    setError("");
    try {
      setCoverFileId((await uploadFile(file, { courseId, category: "cover" })).fileId);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={existing ? "강의 수정" : "새 강의"}
      onFiles={uploading ? undefined : (files) => {
        const image = files.find((f) => f.type.startsWith("image/"));
        if (image) void pickCover(image);
        else setError("대표 그림은 사진 파일만 쓸 수 있어요.");
      }}
    >
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="lecture-date" className="mb-1 block font-medium">
              날짜
            </label>
            <input id="lecture-date" type="date" className="field" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="lecture-time" className="mb-1 block font-medium">
              시작 시각
            </label>
            <input id="lecture-time" type="time" className="field" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="lecture-title" className="mb-1 block font-medium">
            제목
          </label>
          <input id="lecture-title" className="field" required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="lecture-desc" className="mb-1 block font-medium">
            설명
          </label>
          <textarea id="lecture-desc" className="field" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <span className="mb-1 block font-medium">대표 그림</span>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileInput} type="file" accept="image/*" className="sr-only" aria-label="대표 그림 파일" onChange={(e) => e.target.files?.[0] && void pickCover(e.target.files[0])} />
            <button type="button" className="btn btn-ghost" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? "올리는 중이에요" : coverFileId ? "다른 그림 고르기" : "그림 고르기"}
            </button>
            {coverFileId && (
              <button type="button" className="btn btn-ghost" onClick={() => setCoverFileId(null)}>
                그림 빼기
              </button>
            )}
            {coverFileId && !uploading && <span className="text-sm text-accent-ink">그림을 넣었어요.</span>}
          </div>
        </div>
        <Switch checked={published} onCheckedChange={setPublished} label="수강생에게 공개" showLabel />
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={save.isPending || uploading}>
          {existing ? "저장" : "강의 만들기"}
        </button>
      </form>
    </Modal>
  );
}

function DuplicateLecture({ lecture, onClose }: { lecture: LectureRow; onClose: () => void }) {
  const [date, setDate] = useState(todayKst());
  const [startTime, setStartTime] = useState(lecture.startTime);
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: () => unwrap(api.admin.lectures[":id"].duplicate.$post({ param: { id: lecture.id }, json: { date, startTime } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "course"] });
      toast("강의를 복제했어요. 비공개로 만들어졌어요.");
      onClose();
    },
    onError: toastError,
  });
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={`${lecture.title} 복제`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <p className="text-muted">카드, 공지, 강사 자료를 복사해요. 파일은 다시 올리지 않고 함께 써요.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="dup-lecture-date" className="mb-1 block font-medium">
              날짜
            </label>
            <input id="dup-lecture-date" type="date" className="field" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="dup-lecture-time" className="mb-1 block font-medium">
              시작 시각
            </label>
            <input id="dup-lecture-time" type="time" className="field" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary w-full" disabled={run.isPending}>
          복제하기
        </button>
      </form>
    </Modal>
  );
}

function Groups({ courseId, groups }: { courseId: string; groups: { id: string; name: string; position: number }[] }) {
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "course"] });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.admin.groups[":id"].$delete({ param: { id } })),
    onSuccess: async () => {
      setDeleting(null);
      toast("모둠을 지웠어요. 그 모둠의 글은 미지정 칼럼으로 옮겼어요.");
      await refresh();
    },
    onError: toastError,
  });
  const add = useMutation({
    mutationFn: () => unwrap(api.admin.courses[":id"].groups.$post({ param: { id: courseId }, json: { name } })),
    onSuccess: async () => {
      setName("");
      await refresh();
    },
    onError: toastError,
  });
  const move = (id: string, position: number) => unwrap(api.admin.groups[":id"].$patch({ param: { id }, json: { position } })).then(refresh).catch(toastError);
  return (
    <section className="surface rounded-card p-5">
      <h2 className="mb-3 text-lg font-semibold">모둠</h2>
      <ul className="mb-3 space-y-2">
        {groups.map((g, i) => (
          <li key={g.id} className="flex items-center gap-1">
            <input
              className="field min-w-0 flex-1"
              defaultValue={g.name}
              aria-label={`${g.name} 이름`}
              maxLength={20}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== g.name) void unwrap(api.admin.groups[":id"].$patch({ param: { id: g.id }, json: { name: e.target.value } })).then(refresh).catch(toastError);
              }}
            />
            <button className="icon-btn" aria-label={`${g.name} 위로`} disabled={i === 0} onClick={() => void move(g.id, groups[i - 1]!.position)}>
              <ArrowUp size={18} strokeWidth={1.75} />
            </button>
            <button className="icon-btn" aria-label={`${g.name} 아래로`} disabled={i === groups.length - 1} onClick={() => void move(g.id, groups[i + 1]!.position)}>
              <ArrowDown size={18} strokeWidth={1.75} />
            </button>
            <button
              className="icon-btn"
              aria-label={`${g.name} 삭제`}
              onClick={() => setDeleting(g)}
            >
              <Trash2 size={18} strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add.mutate();
        }}
      >
        <input className="field min-w-0 flex-1" placeholder="예: 1모둠" aria-label="새 모둠 이름" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-ghost shrink-0" disabled={add.isPending}>
          모둠 추가
        </button>
      </form>
      <Confirm open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)} title="모둠 삭제" confirmLabel="삭제" busy={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)}>
        <p>
          <strong>{deleting?.name}</strong>을 지울까요? 이 모둠의 수강생은 모둠 없음이 되고, 글은 미지정 칼럼으로 옮겨져요.
        </p>
      </Confirm>
    </section>
  );
}

function Settings({ course }: { course: { id: string; slug: string; title: string; instructorName: string } }) {
  const [title, setTitle] = useState(course.title);
  const [slug, setSlug] = useState(course.slug);
  const [instructorName, setInstructorName] = useState(course.instructorName);
  const check = useSlugCheck(slug, course.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const save = useMutation({
    mutationFn: () => unwrap(api.admin.courses[":id"].$patch({ param: { id: course.id }, json: { title, instructorName, ...(slug !== course.slug ? { slug } : {}) } })),
    onSuccess: async (res) => {
      toast(res.course.slug !== course.slug ? "저장했어요. 옛 주소로 들어와도 새 주소로 넘어가요." : "저장했어요.");
      await qc.invalidateQueries({ queryKey: ["admin"] });
      await navigate(`/admin/c/${encodeURIComponent(res.course.slug)}`, { replace: true });
    },
    onError: toastError,
  });
  return (
    <section className="surface rounded-card p-5">
      <h2 className="mb-3 text-lg font-semibold">과정 설정</h2>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <label htmlFor="set-title" className="mb-1 block font-medium">
            과정 이름
          </label>
          <input id="set-title" className="field" required maxLength={30} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <SlugField id="set-slug" value={slug} onChange={setSlug} courseId={course.id} hint="주소를 바꿔도 옛 주소로 들어오면 새 주소로 넘어가요." />
        <div>
          <label htmlFor="set-instructor" className="mb-1 block font-medium">
            강사 표시 이름
          </label>
          <input id="set-instructor" className="field" required maxLength={30} value={instructorName} onChange={(e) => setInstructorName(e.target.value)} />
        </div>
        <button className="btn btn-ghost" disabled={save.isPending || (slug !== course.slug && check.data?.available === false)}>
          저장
        </button>
      </form>
    </section>
  );
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const save = useMutation({
    mutationFn: () => unwrap(api.admin.password.$post({ json: { current, next } })),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast("비밀번호를 바꿨어요. 다른 기기의 로그인은 모두 풀렸어요.");
    },
    onError: toastError,
  });
  return (
    <section className="surface rounded-card p-5">
      <h2 className="mb-3 text-lg font-semibold">비밀번호 변경</h2>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <label htmlFor="pw-current" className="mb-1 block font-medium">
            지금 비밀번호
          </label>
          <input id="pw-current" type="password" className="field" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pw-next" className="mb-1 block font-medium">
            새 비밀번호 (8자 이상)
          </label>
          <input id="pw-next" type="password" className="field" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <button className="btn btn-ghost" disabled={save.isPending}>
          비밀번호 바꾸기
        </button>
      </form>
    </section>
  );
}

export default function CourseAdmin() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const lookup = useQuery({ queryKey: ["admin", "course-slug", slug], queryFn: () => unwrap(api.courses[":slug"].$get({ param: { slug } })) });
  const courseId = lookup.data?.course.id;
  const detail = useQuery({
    queryKey: ["admin", "course", courseId],
    enabled: Boolean(courseId),
    queryFn: () => unwrap(api.admin.courses[":id"].$get({ param: { id: courseId! } })),
  });
  const [editing, setEditing] = useState<LectureRow | "new" | null>(null);
  const [duplicating, setDuplicating] = useState<LectureRow | null>(null);
  const [duplicatingCourse, setDuplicatingCourse] = useState(false);
  const [deleting, setDeleting] = useState<LectureRow | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "course"] });

  useEffect(() => {
    if (lookup.data?.redirectTo) void navigate(`/admin/c/${encodeURIComponent(lookup.data.redirectTo)}`, { replace: true });
  }, [lookup.data, navigate]);

  const course = detail.data?.course;
  return (
    <AdminFrame title={course?.title ?? "과정"} back={{ to: "/admin/home", label: "과정 목록" }}>
      {lookup.isError && <p className="text-danger">{errorText(lookup.error)}</p>}
      {course && detail.data && (
        <div className="space-y-6">
          <Suspense fallback={null}>
            <HelpPanel courseId={course.id} groups={detail.data.groups} />
          </Suspense>
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 text-muted">{shareUrl(course.slug)}</span>
            <button className="btn btn-ghost" onClick={() => void copyShareLink(course.slug)}>
              링크 복사
            </button>
            <button className="btn btn-ghost" onClick={() => setDuplicatingCourse(true)}>
              과정 복제
            </button>
            {course.status === "ended" ? (
              <button className="btn btn-ghost" onClick={() => void unwrap(api.admin.courses[":id"].reopen.$post({ param: { id: course.id } })).then(refresh).catch(toastError)}>
                과정 재개
              </button>
            ) : (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  void unwrap(api.admin.courses[":id"].end.$post({ param: { id: course.id } }))
                    .then(() => {
                      toast("과정을 종료했어요. 모든 강의가 읽기 전용이 됐어요.");
                      return refresh();
                    })
                    .catch(toastError);
                }}
              >
                과정 종료
              </button>
            )}
          </div>
          {course.status === "ended" && <p className="rounded-control bg-accent-soft p-3">종료된 과정이에요. 수강생은 보기와 내려받기만 할 수 있어요.</p>}

          <section className="surface rounded-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">강의</h2>
              <button className="btn btn-primary" onClick={() => setEditing("new")}>
                <Plus size={18} strokeWidth={1.75} />새 강의
              </button>
            </div>
            {detail.data.lectures.length === 0 && <p className="py-6 text-center text-muted">아직 강의가 없어요. 새 강의를 만들어 보세요.</p>}
            <ul className="divide-y divide-line">
              {detail.data.lectures.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-44 flex-1">
                    <Link to={`/${encodeURIComponent(course.slug)}/l/${l.id}`} className="font-semibold hover:underline">
                      {l.title}
                    </Link>
                    <p className="text-sm text-muted">
                      {l.date} {l.startTime}, {STATUS[l.status]}, 카드 {l.cardCount}개
                    </p>
                  </div>
                  <Switch
                    label={`${l.title} 공개`}
                    showLabel
                    checked={l.published}
                    onCheckedChange={(published) => void unwrap(api.admin.lectures[":id"].$patch({ param: { id: l.id }, json: { published } })).then(refresh).catch(toastError)}
                  />
                  <DotsMenu
                    label={`${l.title} 메뉴`}
                    items={[
                      { label: "강의 페이지에서 편집", onSelect: () => void navigate(`/${encodeURIComponent(course.slug)}/l/${l.id}`) },
                      { label: "정보 수정", onSelect: () => setEditing(l) },
                      { label: "복제", onSelect: () => setDuplicating(l) },
                      ...(l.status !== "before"
                        ? [{ label: "시작 전으로 되돌리기", onSelect: () => void unwrap(api.admin.lectures[":id"].reset.$post({ param: { id: l.id } })).then(() => { refresh(); toast("시작 전으로 되돌렸어요."); }).catch(toastError) }]
                        : []),
                      {
                        label: "삭제",
                        danger: true,
                        onSelect: () => {
                          setConfirmText("");
                          setDeleting(l);
                        },
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          </section>

          <Groups courseId={course.id} groups={detail.data.groups} />
          <Settings key={course.slug} course={course} />
          <BackupButtons courseId={course.id} title={course.title} lectures={detail.data.lectures} />
          <Password />

          {editing && <LectureForm courseId={course.id} lecture={editing} onClose={() => setEditing(null)} />}
          {duplicating && <DuplicateLecture lecture={duplicating} onClose={() => setDuplicating(null)} />}
          <DuplicateCourse course={duplicatingCourse ? course : null} onClose={() => setDuplicatingCourse(false)} />
          <Modal open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)} title="강의 삭제">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void unwrap(api.admin.lectures[":id"].$delete({ param: { id: deleting!.id } }))
                  .then(() => {
                    setDeleting(null);
                    toast("강의를 지웠어요.");
                    return refresh();
                  })
                  .catch(toastError);
              }}
            >
              <p>
                지우려면 강의 제목 <strong>{deleting?.title}</strong>을 그대로 입력해 주세요. 되돌릴 수 없어요.
              </p>
              <input className="field" aria-label="강의 제목 확인" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              <button className="btn btn-danger w-full" disabled={confirmText !== deleting?.title}>
                삭제
              </button>
            </form>
          </Modal>
        </div>
      )}
    </AdminFrame>
  );
}
