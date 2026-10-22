"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import type { MediaStatus } from "@/db/schema";
import { AppIcon } from "./AppIcon";
import { sized } from "@/lib/img";

async function postRequest(body: unknown) {
  const res = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as { created: { status: string }[]; skipped: { id: number; reason: string }[] };
}

/** How long the button keeps showing the pop once a request has gone through (the jar's animation, plus a beat). */
const POP_MS = 1400;

/**
 * Sending a request. Success is the button's own animation (and the status line the page refresh brings); only
 * problems get words. `name` turns an id the server skipped into something readable.
 */
function useSubmit(name?: (id: number) => string | undefined) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (body: unknown) => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await postRequest(body);
      const failed = r.created.filter((c) => c.status === "failed").length;
      setProblem(
        [
          failed ? `${failed === r.created.length ? "It couldn't" : `${failed} couldn't`} be sent to the downloader. The Requests page says why.` : "",
          ...r.skipped.map((s) => `${name?.(s.id) ?? "One"} was skipped: ${s.reason}.`),
        ]
          .filter(Boolean)
          .join(" ") || null,
      );
      if (r.created.length > failed) {
        setSent(true);
        setTimeout(() => setSent(false), POP_MS);
      }
      router.refresh();
      return true;
    } catch (e) {
      setProblem((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, sent, problem, run };
}

function Problem({ text }: { text: string | null }) {
  return text ? <p className="mt-2 text-sm text-bad">{text}</p> : null;
}

/**
 * A request button that becomes its own confirmation: while sending, a jar bobs its lid inside it; once sent, the jar
 * pops (lid flies, sparks burst), the button wobbles, and it settles as "Requested". The jar stays the same element
 * through all of that, so the page refresh that lands mid-pop doesn't restart it.
 */
function SendButton({ label, done, busy, sent, disabled, onClick }: { label: string; done?: string; busy: boolean; sent: boolean; disabled?: boolean; onClick: () => void }) {
  const quiet = busy || sent || !!done;
  return (
    <button className={clsx(quiet ? "btn-done" : "btn-primary", sent && "btn-jelly")} disabled={disabled || quiet} onClick={onClick}>
      {quiet && <AppIcon size={24} animate={sent ? "pop" : busy ? "loading" : undefined} className="-my-1.5 shrink-0 text-fg" />}
      {sent ? "Requested" : busy ? "Requesting…" : (done ?? label)}
    </button>
  );
}

export function MovieRequest({ tmdbId, status, requested }: { tmdbId: number; status: MediaStatus; requested: boolean }) {
  const { busy, sent, problem, run } = useSubmit();
  return (
    <div>
      <SendButton
        label="Request movie"
        done={status === "available" ? "Available" : requested ? "Requested" : undefined}
        busy={busy}
        sent={sent}
        onClick={() => run({ kind: "movie", tmdbId })}
      />
      <Problem text={problem} />
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
  /** Only some of its episodes are requested. */
  someEpisodes?: boolean;
  /** AniList's episode count; null while unknown (still airing). */
  episodes: number | null;
  current: boolean;
  list?: string;
}

/** The current entry's own request button, for the top of its page. */
export function RequestThis({ entry }: { entry: AnimeEntryOption }) {
  const { busy, sent, problem, run } = useSubmit();
  if (!entry.mapped) return <p className="text-sm text-bad">Can&apos;t request this yet: no TVDB/TMDB mapping.</p>;
  return (
    <div>
      <SendButton
        label="Request"
        done={entry.status === "available" ? "Available" : entry.requested ? "Requested" : undefined}
        busy={busy}
        sent={sent}
        onClick={() => run({ kind: "anime", anilistIds: [entry.id] })}
      />
      <Problem text={problem} />
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
  /** Episodes you can pick a range from (null = count unknown); absent when it has no episodes to pick. */
  episodes?: number | null;
}

/** Only these episodes of the one picked tile; absent means all of it. */
type Range = { from: number; to: number };

/** Status chip for something that may be in the library or requested. */
export function libraryChip(status: MediaStatus | undefined, requested: boolean, someEpisodes = false): PickItem["chips"][number] | null {
  return status === "available"
    ? { label: "Available", tone: "ok" }
    : status === "partially_available"
      ? { label: "Partial", tone: "partial" }
      : requested
        ? { label: "Requested", tone: "warn" }
        : someEpisodes
          ? { label: "Some eps requested", tone: "warn" }
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
  onRequest: (ids: number[], episodes?: Range) => unknown;
}) {
  const { busy, sent, problem, run } = useSubmit((id) => items.find((i) => i.id === id)?.title);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const pick = (ids: Set<number>) => {
    setPicked(ids);
    setFrom("");
    setTo("");
  };
  const toggle = (id: number) => pick(picked.has(id) ? new Set([...picked].filter((x) => x !== id)) : new Set([...picked, id]));
  const allOpen = items.filter((i) => i.selectable).map((i) => i.id);
  // Episodes can be picked from one tile at a time; both boxes empty means all of it.
  const one = picked.size === 1 ? items.find((i) => picked.has(i.id)) : undefined;
  const canRange = one?.episodes !== undefined && one.episodes !== 1;
  const max = one?.episodes ?? undefined;
  const range: Range | undefined =
    canRange && (from || to) ? { from: Number(from || 1), to: Number(to || max || from || 1) } : undefined;
  const badRange = !!range && (range.from < 1 || range.to < range.from || (!!max && range.to > max));

  return (
    <section className="card mb-10 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="font-semibold">{heading}</h3>
        {count && <span className="text-sm text-muted">{count}</span>}
        {allOpen.length > 1 && (
          <button className="text-sm text-accent hover:underline" onClick={() => pick(picked.size === allOpen.length ? new Set() : new Set(allOpen))}>
            {picked.size === allOpen.length ? "Clear" : "Select all missing"}
          </button>
        )}
        {(allOpen.length > 0 || picked.size > 0 || sent) && (
          <div className="ml-auto">
            <SendButton
              label={range ? (range.from === range.to ? `Request ep ${range.from}` : `Request eps ${range.from}–${range.to}`) : picked.size ? `Request ${picked.size}` : "Pick to request"}
              busy={busy}
              sent={sent}
              disabled={picked.size === 0 || badRange}
              onClick={async () => (await run(onRequest([...picked], range))) && pick(new Set())}
            />
          </div>
        )}
      </div>
      {canRange && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>Only episodes</span>
          <input type="number" inputMode="numeric" min={1} max={max} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="1" aria-label="First episode" className="input w-16 py-1.5 text-center" />
          <span>to</span>
          <input type="number" inputMode="numeric" min={1} max={max} value={to} onChange={(e) => setTo(e.target.value)} placeholder={max ? String(max) : "same"} aria-label="Last episode" className="input w-16 py-1.5 text-center" />
          <span>{badRange ? <span className="text-bad">Not a valid range{max ? ` (1–${max})` : ""}</span> : "Leave empty for all of it."}</span>
        </div>
      )}
      <Problem text={problem} />
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
                <img {...sized(it.cover, 48)} alt="" loading="lazy" decoding="async" className="h-[4.5rem] w-12 shrink-0 rounded-md bg-panel-2 object-cover" />
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
                {/* Always there, so a chip turning up after a request doesn't make the tile (and the grid) taller. */}
                <div className="mt-1.5 flex min-h-5 flex-wrap gap-1.5 text-[11px]">
                  {it.current && <span className={clsx("rounded px-1.5 py-0.5", TONE.plain)}>This page</span>}
                  {it.chips.map((c) => (
                    <span key={c.label} className={clsx("chip-in rounded px-1.5 py-0.5", TONE[c.tone])}>
                      {c.label}
                    </span>
                  ))}
                </div>
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
    episodes: e.episodes,
    chips: [
      ...(e.mapped ? [libraryChip(e.status, e.requested, e.someEpisodes)] : [{ label: "Not mapped", tone: "bad" as const }]),
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
      onRequest={(ids, episodes) => ({ kind: "anime", anilistIds: ids, episodes })}
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
  /** Only some of its episodes are requested. */
  someEpisodes?: boolean;
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
    episodes: s.episodes,
    chips: [libraryChip(s.status, s.requested, s.someEpisodes)].filter((c) => c !== null),
  }));
  return (
    <PickGrid
      heading="Seasons"
      count={`${regular} season${regular === 1 ? "" : "s"}`}
      items={items}
      onRequest={(ids, episodes) => ({ kind: "tv", tmdbId, seasons: ids, episodes })}
    />
  );
}

/** The hero's button on a series: request every regular season that isn't in yet. */
export function TvRequestAll({ tmdbId, seasons }: { tmdbId: number; seasons: SeasonOption[] }) {
  const { busy, sent, problem, run } = useSubmit();
  const open = seasons.filter((s) => s.number > 0 && seasonOpen(s));
  // Stays up while it pops, though the refresh has left nothing to request.
  if (!open.length && !sent) return null;
  const some = seasons.some((s) => s.number > 0 && !seasonOpen(s));
  return (
    <div>
      <SendButton
        label={some ? `Request ${open.length} missing season${open.length === 1 ? "" : "s"}` : "Request series"}
        busy={busy}
        sent={sent}
        onClick={() => run({ kind: "tv", tmdbId, seasons: open.map((s) => s.number) })}
      />
      <Problem text={problem} />
    </div>
  );
}
