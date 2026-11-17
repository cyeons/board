import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { isStandalone } from "../lib/device";
import { visitedCourses } from "../lib/identity";
import { APP_NAME, HOME_URL, pageTitle } from "../lib/brand";

export default function Guide() {
  const visited = useMemo(visitedCourses, []);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = pageTitle();
    // 홈 화면 앱은 마지막으로 들어간 과정으로 바로 연다 (plan.md 7.7)
    if (isStandalone() && visited[0]) void navigate(`/${encodeURIComponent(visited[0].slug)}`, { replace: true });
  }, [navigate, visited]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="enter-zoom surface w-full max-w-[480px] rounded-hero p-6 sm:p-8">
        <p aria-hidden className="emoji mb-4 text-5xl">
          🧭
        </p>
        <h1 className="mb-2 text-2xl font-bold">{APP_NAME}</h1>
        <p className="mb-6 text-muted">강사님께 받은 연수 주소로 들어와 주세요.</p>
        {visited.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-muted">이 기기에서 들어갔던 과정</h2>
            <ul className="space-y-2">
              {visited.map((v) => (
                <li key={v.slug}>
                  <Link to={`/${encodeURIComponent(v.slug)}`} className="btn btn-quiet w-full justify-start">
                    {v.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {HOME_URL && (
          <a href={HOME_URL} className="font-semibold text-accent-ink underline underline-offset-4">
            {APP_NAME} 홈으로 돌아가기
          </a>
        )}
      </div>
    </main>
  );
}
