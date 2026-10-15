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

type Tone = "ok" | "partial" | "warn" | "bad" | "anilist" | "plain";
const TONE: Record<Tone, string> = {
  ok: "bg-ok/15 text-ok",
  partial: "bg-ok/10 text-ok/80",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/10 text-bad",
  anilist: "bg-anilist/15 text-anilist",
  plain: "bg-panel-2 text-fg/80",
};

export interface PickItem {
  id: number;
  title: string;
  sub: string;
  cover: string | null;
  href?: string;
  chips: { label: string; tone: Tone }[];
  selectable: boolean;
  /** The page you're on. */
  current?: boolean;
  /** Small print under the tile (e.g. the Sonarr target, for admins). */
  note?: { text: string; bad?: boolean };
}

/** Status chip for something that may be in the library or requested. */
export function libraryChip(status: MediaStatus | undefined, requested: boolean): PickItem["chips"][number] | null {
  return status === "available"
    ? { label: "Available", tone: "ok" }
    : status === "partially_available"
      ? { label: "Partial", tone: "partial" }
      : requested
        ? { label: "Requested", tone: "warn" }
        : null;
}

/**
 * Seasons (or a franchise's entries) as a grid of tiles; tick some and request them together. The same block on
 * series and anime pages. `placeholders` holds space with skeleton tiles while the list is still loading.
 */
function PickGrid({
  heading,
  count,
  items,
  placeholders = 0,
  footer,
  onRequest,
}: {
  heading: string;
  count?: string;
  items: PickItem[];
  placeholders?: number;
  footer?: React.ReactNode;
  onRequest: (ids: number[]) => unknown;
}) {
  const { busy, msg, run } = useSubmit();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  const allOpen = items.filter((i) => i.selectable).map((i) => i.id);

  return (
    <section className="card mb-10 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="font-semibold">{heading}</h3>
        {count && <span className="text-sm text-muted">{count}</span>}
        {allOpen.length > 1 && (
          <button className="text-sm text-accent hover:underline" onClick={() => setPicked(picked.size === allOpen.length ? new Set() : new Set(allOpen))}>
            {picked.size === allOpen.length ? "Clear" : "Select all missing"}
          </button>
        )}
        {(allOpen.length > 0 || picked.size > 0) && (
          <button className="btn-primary ml-auto" disabled={busy || picked.size === 0} onClick={() => run(onRequest([...picked]))}>
            {busy ? "Requesting…" : picked.size ? `Request ${picked.size}` : "Pick to request"}
          </button>
        )}
      </div>
      <Message msg={msg} />
      <ul className="mt-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {items.map((it) => {
          const on = picked.has(it.id);
          return (
            <li
              key={it.id}
              className={clsx(
                "group relative flex gap-3 rounded-xl border p-2.5 transition",
                on ? "border-accent bg-accent/10" : it.current ? "border-muted/60 bg-panel-2/60" : "border-line",
                it.selectable && !on && "hover:border-muted",
                !it.current && "rise-in",
              )}
            >
              {it.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.cover} alt="" loading="lazy" className="h-[4.5rem] w-12 shrink-0 rounded-md bg-panel-2 object-cover" />
              ) : (
                <div className="h-[4.5rem] w-12 shrink-0 rounded-md bg-panel-2" />
              )}
              <div className="min-w-0 flex-1 pr-5">
                {it.href ? (
                  <a href={it.href} className="relative z-10 line-clamp-2 text-sm leading-snug hover:underline" aria-current={it.current ? "page" : undefined}>
                    {it.title}
                  </a>
                ) : (
                  <div className="line-clamp-2 text-sm leading-snug">{it.title}</div>
                )}
                <div className="mt-0.5 text-xs text-muted">{it.sub}</div>
                {(it.current || it.chips.length > 0) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                    {it.current && <span className={clsx("rounded px-1.5 py-0.5", TONE.plain)}>This page</span>}
                    {it.chips.map((c) => (
                      <span key={c.label} className={clsx("rounded px-1.5 py-0.5", TONE[c.tone])}>
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}
                {it.note && <div className={clsx("mt-1 truncate text-[11px]", it.note.bad ? "text-bad" : "text-muted/70")}>{it.note.text}</div>}
              </div>
              {it.selectable && (
                // The whole tile toggles; the title link sits above it.
                <label className="absolute inset-0 cursor-pointer rounded-xl">
                  <input type="checkbox" className="absolute right-2.5 top-2.5 accent-accent" checked={on} onChange={() => toggle(it.id)} aria-label={`Select ${it.title}`} />
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

/** A franchise's seasons and films. */
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
  const items: PickItem[] = entries.map((e) => ({
    id: e.id,
    title: e.title,
    sub: e.sub,
    cover: e.cover,
    href: `/anime/${e.id}`,
    current: e.current,
    selectable: e.mapped && !e.requested && e.status !== "available",
    chips: [
      ...(e.mapped ? [libraryChip(e.status, e.requested)] : [{ label: "Not mapped", tone: "bad" as const }]),
      e.list ? { label: e.list, tone: "anilist" as const } : null,
    ].filter((c) => c !== null),
    note: showTargets ? { text: `→ ${e.target}`, bad: !e.mapped } : undefined,
  }));
  const many = entries.length > 1 || placeholders > 0;
  return (
    <PickGrid
      heading={many ? "Seasons & films" : "Request"}
      count={many ? `${entries.length} in this franchise` : undefined}
      items={items}
      placeholders={placeholders}
      footer={footer}
      onRequest={(ids) => ({ kind: "anime", anilistIds: ids })}
    />
  );
}

export interface SeasonOption {
  number: number;
  name: string;
  episodes: number;
  year: string | null;
  poster: string | null;
  status?: MediaStatus;
  requested: boolean;
}

const seasonOpen = (s: SeasonOption) => !s.requested && s.status !== "available";

/** A series' seasons. */
export function TvRequest({ tmdbId, seasons }: { tmdbId: number; seasons: SeasonOption[] }) {
  // Specials after the real seasons.
  const ordered = [...seasons.filter((s) => s.number > 0), ...seasons.filter((s) => s.number === 0)];
  const regular = ordered.filter((s) => s.number > 0).length;
  const items: PickItem[] = ordered.map((s) => ({
    id: s.number,
    title: s.name,
    sub: [s.year, `${s.episodes} episodes`].filter(Boolean).join(" · "),
    cover: s.poster,
    selectable: seasonOpen(s),
    chips: [libraryChip(s.status, s.requested)].filter((c) => c !== null),
  }));
  return (
    <PickGrid
      heading="Seasons"
      count={`${regular} season${regular === 1 ? "" : "s"}`}
      items={items}
      onRequest={(ids) => ({ kind: "tv", tmdbId, seasons: ids })}
    />
  );
}

/** The hero's button on a series: request every regular season that isn't in yet. */
export function TvRequestAll({ tmdbId, seasons }: { tmdbId: number; seasons: SeasonOption[] }) {
  const { busy, msg, run } = useSubmit();
  const open = seasons.filter((s) => s.number > 0 && seasonOpen(s));
  if (!open.length) return null;
  const some = seasons.some((s) => s.number > 0 && !seasonOpen(s));
  return (
    <div>
      <button className="btn-primary" disabled={busy} onClick={() => run({ kind: "tv", tmdbId, seasons: open.map((s) => s.number) })}>
        {busy ? "Requesting…" : some ? `Request ${open.length} missing season${open.length === 1 ? "" : "s"}` : "Request series"}
      </button>
      <Message msg={msg} />
    </div>
  );
}
