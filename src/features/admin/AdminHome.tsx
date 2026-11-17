import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { DotsMenu } from "../../components/ui/Menu";
import { Modal } from "../../components/ui/Modal";
import { api, errorText, unwrap } from "../../lib/api";
import { formatBytes, todayKst } from "../../lib/format";
import { toast, toastError } from "../../lib/toast";
import { AdminFrame } from "./AdminFrame";
import { sharePrefix, shareUrl } from "../../lib/brand";

const CAPACITY = 10 * 1024 ** 3;


export async function copyShareLink(slug: string) {
  // 사람이 읽을 수 있는 주소 그대로 복사한다 (plan.md 4.3)
  try {
    await navigator.clipboard.writeText(shareUrl(slug));
    toast(`${shareUrl(slug)} 주소를 복사했어요.`);
  } catch {
    toast(`복사하지 못했어요. 주소를 직접 알려 주세요: ${shareUrl(slug)}`, { tone: "error" });
  }
}

/** 입력하는 즉시 이름을 쓸 수 있는지 보여 준다. */
export function useSlugCheck(title: string, courseId?: string) {
  const [debounced, setDebounced] = useState(title);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(title), 200);
    return () => clearTimeout(t);
  }, [title]);
  return useQuery({
    queryKey: ["admin", "slug", debounced, courseId],
    enabled: debounced.trim().length > 0,
    queryFn: () => unwrap(api.admin["slug-check"].$get({ query: { slug: debounced, course: courseId } })),
  });
}

/** 과정 주소 칸. 과정 주소 앞부분 뒤에 붙는 부분이고, 쓸 수 있는지 바로 보여 준다. */
export function SlugField({ id, value, onChange, courseId, hint }: { id: string; value: string; onChange: (v: string) => void; courseId?: string; hint?: string }) {
  const check = useSlugCheck(value, courseId);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-medium">
        주소
      </label>
      <div className="field flex items-center gap-0.5 focus-within:outline-2 focus-within:outline-accent">
        <span className="shrink-0 text-muted" aria-hidden>
          {sharePrefix()}
        </span>
        <input id={id} className="min-w-0 flex-1 bg-transparent outline-none" required maxLength={30} value={value} onChange={(e) => onChange(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </div>
      {value.trim() && check.data ? (
        <p className={`mt-1 text-sm ${check.data.available ? "text-accent-ink" : "text-danger"}`} data-testid="slug-check">
          {check.data.message} {check.data.available && <span className="text-muted">{shareUrl(check.data.slug)}</span>}
        </p>
      ) : (
        hint && <p className="mt-1 text-sm text-muted">{hint}</p>
      )}
    </div>
  );
}

const SLUG_HINT = "수강생이 들어올 주소예요. 한글, 영문, 숫자, 하이픈(-)으로 짧게 정해 주세요.";

function NewCourse({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [title, setTitle] = useState("");
  // 직접 고치기 전까지 주소는 과정 이름을 따라간다
  const [slugInput, setSlug] = useState<string | null>(null);
  const slug = slugInput ?? title;
  const [instructorName, setInstructorName] = useState("");
  const [error, setError] = useState("");
  const check = useSlugCheck(slug);
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => unwrap(api.admin.courses.$post({ json: { title, slug, instructorName } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "courses"] });
      setTitle("");
      setSlug(null);
      setInstructorName("");
      setError("");
      onOpenChange(false);
    },
    onError: (e) => setError(errorText(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="새 과정">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="course-title" className="mb-1 block font-medium">
            과정 이름
          </label>
          <input id="course-title" className="field" required maxLength={30} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 초등 AI 수업 연수" />
        </div>
        <SlugField id="course-slug" value={slug} onChange={setSlug} hint={SLUG_HINT} />
        <div>
          <label htmlFor="course-instructor" className="mb-1 block font-medium">
            강사 표시 이름
          </label>
          <input id="course-instructor" className="field" required maxLength={30} value={instructorName} onChange={(e) => setInstructorName(e.target.value)} placeholder="수강생에게 보이는 이름" />
        </div>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={create.isPending || check.data?.available === false}>
          과정 만들기
        </button>
      </form>
    </Modal>
  );
}

export function DuplicateCourse({ course, onClose }: { course: { id: string; title: string } | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [slugInput, setSlug] = useState<string | null>(null);
  const slug = slugInput ?? title;
  const [firstDate, setFirstDate] = useState(todayKst());
  const check = useSlugCheck(slug);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const run = useMutation({
    mutationFn: () => unwrap(api.admin.courses[":id"].duplicate.$post({ param: { id: course!.id }, json: { title, slug, firstDate } })),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["admin", "courses"] });
      toast("과정을 복제했어요. 강의는 비공개로 만들어졌어요.");
      onClose();
      await navigate(`/admin/c/${encodeURIComponent(res.slug)}`);
    },
    onError: toastError,
  });
  return (
    <Modal open={Boolean(course)} onOpenChange={(v) => !v && onClose()} title={`${course?.title ?? ""} 복제`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <p className="text-muted">강의, 카드, 공지, 강사 자료, 모둠을 복사해요. 수강생과 수강생 글은 복사하지 않아요.</p>
        <div>
          <label htmlFor="dup-title" className="mb-1 block font-medium">
            새 과정 이름
          </label>
          <input id="dup-title" className="field" required maxLength={30} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <SlugField id="dup-slug" value={slug} onChange={setSlug} hint={SLUG_HINT} />
        <div>
          <label htmlFor="dup-date" className="mb-1 block font-medium">
            첫 강의 날짜
          </label>
          <input id="dup-date" type="date" className="field" required value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
          <p className="mt-1 text-sm text-muted">다른 강의 날짜는 간격을 유지해서 옮겨요.</p>
        </div>
        <button className="btn btn-primary w-full" disabled={run.isPending || check.data?.available === false}>
          복제하기
        </button>
      </form>
    </Modal>
  );
}

export default function AdminHome() {
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const data = useQuery({ queryKey: ["admin", "courses"], queryFn: () => unwrap(api.admin.courses.$get()) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "courses"] });
  const used = data.data?.usedBytes ?? 0;
  const pct = Math.min(100, (used / CAPACITY) * 100);

  return (
    <AdminFrame title="과정">
      <section aria-label="저장 공간 사용량" className="surface mb-6 rounded-card p-4">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium">저장 공간</span>
          <span className="text-muted" data-testid="usage">
            {formatBytes(used)} 사용, 10GB 중 (9GB에서 업로드가 멈춰요)
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-accent-soft" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="저장 공간 사용량">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <div className="mb-4 flex justify-end">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={18} strokeWidth={1.75} />새 과정
        </button>
      </div>

      {data.isError && <p className="text-danger">{errorText(data.error)}</p>}
      {data.data?.courses.length === 0 && <p className="surface rounded-card p-8 text-center text-muted">아직 과정이 없어요. 새 과정을 만들어 보세요.</p>}

      <ul className="space-y-3">
        {data.data?.courses.map((course) => (
          <li key={course.id} className="surface flex flex-wrap items-center gap-3 rounded-card p-4">
            <div className="min-w-48 flex-1">
              <Link to={`/admin/c/${encodeURIComponent(course.slug)}`} className="text-md font-semibold hover:underline">
                {course.title}
              </Link>
              <p className="text-sm text-muted">{shareUrl(course.slug)}</p>
              <p className="text-sm text-muted">
                {course.status === "ended" ? "종료" : "진행 중"}, 강의 {course.lectureCount}개{course.lastLectureDate ? `, 마지막 강의 ${course.lastLectureDate}` : ""}
              </p>
            </div>
            <button className="btn btn-ghost" onClick={() => void copyShareLink(course.slug)}>
              링크 복사
            </button>
            <button className="btn btn-ghost" onClick={() => void navigate(`/admin/c/${encodeURIComponent(course.slug)}`)}>
              열기
            </button>
            <DotsMenu
              label={`${course.title} 메뉴`}
              items={[
                { label: "복제", onSelect: () => setDuplicating(course) },
                course.status === "ended"
                  ? { label: "과정 재개", onSelect: () => void unwrap(api.admin.courses[":id"].reopen.$post({ param: { id: course.id } })).then(refresh).catch(toastError) }
                  : { label: "과정 종료", onSelect: () => void unwrap(api.admin.courses[":id"].end.$post({ param: { id: course.id } })).then(refresh).catch(toastError) },
                {
                  label: "삭제",
                  danger: true,
                  onSelect: () => {
                    setConfirmText("");
                    setDeleting(course);
                  },
                },
              ]}
            />
          </li>
        ))}
      </ul>

      <NewCourse open={creating} onOpenChange={setCreating} />
      <DuplicateCourse course={duplicating} onClose={() => setDuplicating(null)} />
      <Modal open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)} title="과정 삭제">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void unwrap(api.admin.courses[":id"].$delete({ param: { id: deleting!.id } }))
              .then(() => {
                setDeleting(null);
                toast("과정을 지웠어요.");
                return refresh();
              })
              .catch(toastError);
          }}
        >
          <p>
            지우려면 과정 이름 <strong>{deleting?.title}</strong>을 그대로 입력해 주세요. 되돌릴 수 없어요.
          </p>
          <input className="field" aria-label="과정 이름 확인" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <button className="btn btn-danger w-full" disabled={confirmText !== deleting?.title}>
            삭제
          </button>
        </form>
      </Modal>
    </AdminFrame>
  );
}
