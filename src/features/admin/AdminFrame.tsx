import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, LogOut } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { Toasts } from "../../components/ui/Toasts";
import { api, unwrap } from "../../lib/api";
import { setActiveCourse } from "../../lib/identity";
import { toastError } from "../../lib/toast";
import { APP_NAME, pageTitle } from "../../lib/brand";

export const useAdminMe = () =>
  useQuery({ queryKey: ["admin", "me"], queryFn: () => unwrap(api.admin.me.$get()), staleTime: 60_000 });

export function AdminFrame({ title, children, back }: { title: string; children: ReactNode; back?: { to: string; label: string } }) {
  const me = useAdminMe();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    setActiveCourse(null);
    document.title = pageTitle(title);
  }, [title]);

  useEffect(() => {
    if (me.data && !me.data.instructor) void navigate("/admin", { replace: true });
  }, [me.data, navigate]);

  if (!me.data?.instructor) return <PageSkeleton width={960} />;

  return (
    <div className="mx-auto max-w-[960px] px-[var(--gutter)] pb-16">
      <Toasts />
      <header className="flex min-h-16 flex-wrap items-center gap-3 pt-[calc(12px+var(--safe-top))] pb-3">
        <Link to="/admin/home" className="font-bold">
          {APP_NAME}
        </Link>
        {back && (
          <Link to={back.to} className="text-sm text-muted underline underline-offset-4">
            {back.label}
          </Link>
        )}
        <div className="flex-1" />
        <Link to="/admin/storage" className="btn btn-ghost">
          <HardDrive size={18} strokeWidth={1.75} />
          저장 공간
        </Link>
        <button
          className="btn btn-ghost"
          onClick={() => {
            void unwrap(api.admin.logout.$post())
              .then(() => {
                qc.clear();
                return navigate("/admin", { replace: true });
              })
              .catch(toastError);
          }}
        >
          <LogOut size={18} strokeWidth={1.75} />
          로그아웃
        </button>
      </header>
      <h1 className="mb-6 text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}
