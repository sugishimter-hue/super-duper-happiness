"use client";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";

export default function LoginForm() {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const password = new FormData(e.currentTarget).get("password");
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || "로그인하지 못했습니다.");
      window.location.href = "/admin";
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인하지 못했습니다.");
      setBusy(false);
    }
  }
  return <main className="adminMain loginMain">
    <a href="/">← 유니패스 라이프</a>
    <form className="adminRecord loginCard" onSubmit={submit}>
      <LockKeyhole size={28} />
      <h1>상담 관리 로그인</h1>
      <p className="muted">관리자 비밀번호를 입력해 주세요.</p>
      <label>비밀번호<input name="password" type="password" required autoComplete="current-password" autoFocus /></label>
      <p role="alert" className="error">{error}</p>
      <button className="primary full" disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
    </form>
  </main>;
}
