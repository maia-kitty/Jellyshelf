"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import type { MediaStatus } from "@/db/schema";
import { AppIcon } from "./AppIcon";

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
  return (
    <p className={clsx("mt-2 flex items-center gap-2 text-sm", msg.ok ? "text-ok" : "text-bad")}>
      {/* keyed so every new success replays the pop */}
      {msg.ok && <AppIcon key={msg.text} size={22} animate="pop" className="shrink-0 text-fg" />}
      {msg.text}
    </p>
  );
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
  cover: string | null;
  /** Where it would go, e.g. "Sonarr TVDB 424536, season 1" (shown to admins). */
  target: string;
  mapped: boolean;
  status?: MediaStatus;
  requested: boolean;
  current: boolean;
  list?: string;
}

/** The current entry's own request button, for the top of its page. */
export function RequestThis({ entry }: { entry: AnimeEntryOption }) {
  const { busy, msg, run } = useSubmit();
  if (!entry.mapped) return <p className="text-sm text-bad">Can&apos;t request this yet: no TVDB/TMDB mapping.</p>;
  const done = entry.requested || entry.status === "available";
  return (
    <div>
      <button className="btn-primary" disabled={busy || done} onClick={() => run({ kind: "anime", anilistIds: [entry.id] })}>
        {entry.status === "available" ? "Available" : entry.requested ? "Requested" : busy ? "Requesting…" : "Request"}
      </button>
      <Message msg={msg} />
    </div>
  );
}

const STATUS_CHIP: Record<string, string> = {
  available: "bg-ok/15 text-ok",
  partial: "bg-ok/10 text-ok/80",
  requested: "bg-warn/15 text-warn",
  unmapped: "bg-bad/10 text-bad",
};

/**
 * Every season/film in a franchise as a grid of tiles; tick the ones you want and request them together.
 * `placeholders`: while the franchise is still loading, hold its space with that many skeleton tiles.
 */
export function AnimeRequest({
  entries,
  placeholders = 0,
  showTargets = false,
  footer,
}: {
  entries: AnimeEntryOption[];
  placeholders?: number;
  showTargets?: boolean;
  footer?: React.ReactNode;
}) {
  const { busy, msg, run } = useSubmit();
  const selectable = (e: AnimeEntryOption) => e.mapped && !e.requested && e.status !== "available";
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  const allOpen = entries.filter(selectable).map((e) => e.id);
  const many = entries.length > 1 || placeholders > 0;

  return (
    <section className="card mb-10 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="font-semibold">{many ? "Seasons & films" : "Request"}</h3>
        {many && <span className="text-sm text-muted">{entries.length} in this franchise</span>}
        {allOpen.length > 1 && (
          <button className="text-sm text-accent hover:underline" onClick={() => setPicked(picked.size === allOpen.length ? new Set() : new Set(allOpen))}>
            {picked.size === allOpen.length ? "Clear" : "Select all missing"}
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button className="btn-primary" disabled={busy || picked.size === 0} onClick={() => run({ kind: "anime", anilistIds: [...picked] })}>
            {busy ? "Requesting…" : picked.size ? `Request ${picked.size}` : "Pick to request"}
          </button>
        </div>
      </div>
      <Message msg={msg} />
      <ul className="mt-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {entries.map((e) => {
          const can = selectable(e);
          const on = picked.has(e.id);
          const chip = !e.mapped
            ? ["unmapped", "Not mapped"]
            : e.status === "available"
              ? ["available", "Available"]
              : e.status === "partially_available"
                ? ["partial", "Partial"]
                : e.requested
                  ? ["requested", "Requested"]
                  : null;
          return (
            <li
              key={e.id}
              className={clsx(
                "group relative flex gap-3 rounded-xl border p-2.5 transition",
                on ? "border-accent bg-accent/10" : e.current ? "border-muted/60 bg-panel-2/60" : "border-line",
                can && !on && "hover:border-muted",
                !e.current && "rise-in",
              )}
              title={showTargets ? `→ ${e.target}` : undefined}
            >
              {e.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.cover} alt="" loading="lazy" className="h-[4.5rem] w-12 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-[4.5rem] w-12 shrink-0 rounded-md bg-panel-2" />
              )}
              <div className="min-w-0 flex-1">
                <a href={`/anime/${e.id}`} className="relative z-10 line-clamp-2 text-sm leading-snug hover:underline" aria-current={e.current ? "page" : undefined}>
                  {e.title}
                </a>
                <div className="mt-0.5 text-xs text-muted">{e.sub}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                  {e.current && <span className="rounded bg-panel-2 px-1.5 py-0.5 text-fg/80">This page</span>}
                  {chip && <span className={clsx("rounded px-1.5 py-0.5", STATUS_CHIP[chip[0]])}>{chip[1]}</span>}
                  {e.list && <span className="rounded bg-anilist/15 px-1.5 py-0.5 text-anilist">{e.list}</span>}
                </div>
                {showTargets && <div className={clsx("mt-1 truncate text-[11px]", e.mapped ? "text-muted/70" : "text-bad")}>→ {e.target}</div>}
              </div>
              {can && (
                // The whole tile toggles; the title link sits above it.
                <label className="absolute inset-0 cursor-pointer rounded-xl">
                  <input type="checkbox" className="absolute right-2.5 top-2.5 accent-accent" checked={on} onChange={() => toggle(e.id)} aria-label={`Select ${e.title}`} />
                </label>
              )}
            </li>
          );
        })}
        {Array.from({ length: placeholders }, (_, n) => (
          <li key={`ph${n}`} aria-hidden className="flex animate-pulse gap-3 rounded-xl border border-line p-2.5">
            <div className="h-[4.5rem] w-12 rounded-md bg-panel-2" />
            <div className="flex-1 space-y-1.5 py-0.5">
              <div className="h-3.5 w-3/5 rounded bg-panel-2" />
              <div className="h-3 w-2/5 rounded bg-panel-2" />
            </div>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-4">{footer}</div>}
    </section>
  );
}
