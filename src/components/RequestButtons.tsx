"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import type { MediaStatus } from "@/db/schema";

async function postRequest(body: unknown) {
  const res = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as { created: { status: string }[]; skipped: { id: number; reason: string }[] };
}

function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (body: unknown) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await postRequest(body);
      const approved = r.created.filter((c) => c.status === "approved").length;
      const failed = r.created.filter((c) => c.status === "failed").length;
      const parts = [
        approved ? `${approved} sent to downloader` : "",
        r.created.length - approved - failed ? `${r.created.length - approved - failed} awaiting approval` : "",
        failed ? `${failed} failed (see Requests)` : "",
        ...r.skipped.map((s) => `skipped #${s.id}: ${s.reason}`),
      ].filter(Boolean);
      setMsg({ ok: failed === 0, text: parts.join(" · ") || "Requested" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run };
}

function Message({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={clsx("mt-2 text-sm", msg.ok ? "text-ok" : "text-bad")}>{msg.text}</p>;
}

export function MovieRequest({ tmdbId, status, requested }: { tmdbId: number; status: MediaStatus; requested: boolean }) {
  const { busy, msg, run } = useSubmit();
  const done = status === "available" || requested;
  return (
    <div>
      <button className="btn-primary" disabled={busy || done} onClick={() => run({ kind: "movie", tmdbId })}>
        {status === "available" ? "Available" : requested ? "Requested" : busy ? "Requesting…" : "Request movie"}
      </button>
      <Message msg={msg} />
    </div>
  );
}

export interface SeasonOption {
  number: number;
  name: string;
  episodes: number;
  status?: MediaStatus;
  requested: boolean;
}

export function TvRequest({ tmdbId, seasons }: { tmdbId: number; seasons: SeasonOption[] }) {
  const { busy, msg, run } = useSubmit();
  const open = seasons.filter((s) => !s.requested && s.status !== "available");
  const [picked, setPicked] = useState<Set<number>>(new Set(open.filter((s) => s.number > 0).map((s) => s.number)));
  const toggle = (n: number) => setPicked((p) => (p.has(n) ? new Set([...p].filter((x) => x !== n)) : new Set([...p, n])));
  return (
    <div className="card p-4">
      <h3 className="mb-3 font-semibold">Seasons</h3>
      <ul className="divide-y divide-line">
        {seasons.map((s) => {
          const locked = s.requested || s.status === "available";
          return (
            <li key={s.number} className="flex items-center gap-3 py-2">
              <input type="checkbox" className="accent-accent" disabled={locked} checked={locked || picked.has(s.number)} onChange={() => toggle(s.number)} />
              <span className="flex-1 text-sm">
                {s.name} <span className="text-muted">· {s.episodes} eps</span>
              </span>
              <span className="text-xs text-muted">
                {s.status === "available" ? "Available" : s.status === "partially_available" ? "Partial" : s.requested ? "Requested" : ""}
              </span>
            </li>
          );
        })}
      </ul>
      <button className="btn-primary mt-4" disabled={busy || picked.size === 0} onClick={() => run({ kind: "tv", tmdbId, seasons: [...picked] })}>
        {busy ? "Requesting…" : `Request ${picked.size} season${picked.size === 1 ? "" : "s"}`}
      </button>
      <Message msg={msg} />
    </div>
  );
}

export interface AnimeEntryOption {
  id: number;
  title: string;
  sub: string;
  target: string;
  mapped: boolean;
  status?: MediaStatus;
  requested: boolean;
  current: boolean;
  list?: string;
}

/** Pick one or more AniList entries (e.g. every season in a franchise) and request them. */
export function AnimeRequest({ entries }: { entries: AnimeEntryOption[] }) {
  const { busy, msg, run } = useSubmit();
  const selectable = (e: AnimeEntryOption) => e.mapped && !e.requested && e.status !== "available";
  const [picked, setPicked] = useState<Set<number>>(new Set(entries.filter((e) => e.current && selectable(e)).map((e) => e.id)));
  const toggle = (id: number) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  const allOpen = entries.filter(selectable).map((e) => e.id);

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">{entries.length > 1 ? "Seasons in this franchise" : "Request"}</h3>
        {allOpen.length > 1 && (
          <button className="text-sm text-accent hover:underline" onClick={() => setPicked(new Set(allOpen))}>
            Select all missing
          </button>
        )}
      </div>
      <ul className="divide-y divide-line">
        {entries.map((e) => {
          const locked = !selectable(e);
          return (
            <li key={e.id} className={clsx("flex items-start gap-3 py-2.5", e.current && "rounded-lg")}>
              <input
                type="checkbox"
                className="mt-1 accent-accent"
                disabled={locked}
                checked={e.requested || e.status === "available" || picked.has(e.id)}
                onChange={() => toggle(e.id)}
              />
              <div className="min-w-0 flex-1">
                <a href={`/anime/${e.id}`} className={clsx("text-sm hover:underline", e.current && "font-semibold")}>
                  {e.title}
                </a>
                <div className="text-xs text-muted">{e.sub}</div>
                <div className={clsx("text-xs", e.mapped ? "text-muted" : "text-bad")}>→ {e.target}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                {e.list && <span className="text-anilist">{e.list}</span>}
                <span className="text-muted">
                  {e.status === "available" ? "Available" : e.status === "partially_available" ? "Partial" : e.requested ? "Requested" : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <button className="btn-primary mt-4" disabled={busy || picked.size === 0} onClick={() => run({ kind: "anime", anilistIds: [...picked] })}>
        {busy ? "Requesting…" : picked.size > 1 ? `Request ${picked.size} entries` : "Request"}
      </button>
      <Message msg={msg} />
    </div>
  );
}
