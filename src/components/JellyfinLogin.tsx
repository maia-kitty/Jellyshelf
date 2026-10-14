"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JellyfinLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        const res = await fetch("/api/auth/jellyfin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const j = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) return setErr(j.error ?? "Sign-in failed");
        router.push(j.redirect ?? "/");
        router.refresh();
      }}
    >
      <input className="input" placeholder="Jellyfin username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
      <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      {err && <p className="text-sm text-bad">{err}</p>}
      <button className="btn-primary w-full" disabled={busy || !username}>
        {busy ? "Signing in…" : "Sign in with Jellyfin"}
      </button>
    </form>
  );
}
