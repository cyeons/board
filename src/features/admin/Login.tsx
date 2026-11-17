import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, errorText, unwrap } from "../../lib/api";
import { useAdminMe } from "./AdminFrame";
import { pageTitle } from "../../lib/brand";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useAdminMe();

  useEffect(() => {
    document.title = pageTitle("강사 로그인");
    if (me.data?.instructor) void navigate("/admin/home", { replace: true });
  }, [me.data, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await unwrap(api.admin.login.$post({ json: { password } }));
      await qc.invalidateQueries({ queryKey: ["admin", "me"] });
      await navigate("/admin/home", { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="enter-zoom surface w-full max-w-[400px] space-y-5 rounded-hero p-6 sm:p-8">
        <div>
          <p aria-hidden className="emoji mb-4 text-5xl">
            🔐
          </p>
          <h1 className="text-2xl font-bold">강사 로그인</h1>
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
            비밀번호
          </label>
          <input id="password" type="password" className="field" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={!password} aria-busy={busy}>
          로그인
        </button>
      </form>
    </main>
  );
}
