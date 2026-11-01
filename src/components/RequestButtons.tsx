"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import type { MediaStatus } from "@/db/schema";
import { AppIcon } from "./AppIcon";
import { sized } from "@/lib/img";
import { episodeRuns } from "@/lib/episodeScope";
import { Tabs } from "./PillTabs";

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
  const run = async (body: unknown | unknown[]) => {
    setBusy(true);
    setProblem(null);
    try {
      const rs = [];
      for (const b of Array.isArray(body) ? body : [body]) rs.push(await postRequest(b));
      const r = { created: rs.flatMap((x) => x.created), skipped: rs.flatMap((x) => x.skipped) };
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
function SendButton({
  label,
  done,
  busy,
  sent,
  disabled,
  onClick,
  buttonRef,
  expanded,
}: {
  label: string;
  done?: string;
  busy: boolean;
  sent: boolean;
  disabled?: boolean;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  /** Set when the button opens a menu: it gets a chevron that flips while the menu is open. */
  expanded?: boolean;
}) {
  const quiet = busy || sent || !!done;
  return (
    <button
      ref={buttonRef}
      className={clsx(quiet ? "btn-done" : "btn-primary", sent && "btn-jelly")}
      disabled={disabled || quiet}
      onClick={onClick}
      aria-haspopup={expanded !== undefined ? "menu" : undefined}
      aria-expanded={expanded}
    >
      {quiet && <AppIcon size={24} animate={sent ? "pop" : busy ? "loading" : undefined} className="-my-1.5 shrink-0 text-fg" />}
      {sent ? "Requested" : busy ? "Requesting…" : (done ?? label)}
      {expanded !== undefined && !quiet && (
        <svg viewBox="0 0 24 24" aria-hidden className={clsx("-mr-1 h-4 w-4 transition-transform duration-300", expanded && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      )}
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
  mapped: boolean;
  /** A dub quality profile is set up where it would go, so the request can ask for dubbed. */
  canDub: boolean;
  status?: MediaStatus;
  requested: boolean;
  /** AniList's episode count; null while unknown (still airing). */
  episodes: number | null;
}

const flip = (s: Set<number>, n: number) => (s.has(n) ? new Set([...s].filter((x) => x !== n)) : new Set([...s, n]));

/** Episode numbers to tap on and off; the downloaded ones (`have`) are greyed out. */
function EpisodeGrid({ total, have = [], picked, onToggle, className }: { total: number; have?: number[]; picked: Set<number>; onToggle: (n: number) => void; className: string }) {
  return (
    <div className={clsx("grid max-h-60 gap-1.5 overflow-y-auto overscroll-contain p-0.5", className)}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n, i) => {
        const got = have.includes(n);
        const on = picked.has(n);
        return (
          <button
            key={n}
            disabled={got}
            aria-pressed={on}
            title={got ? "Already downloaded" : undefined}
            onClick={() => onToggle(n)}
            className={clsx(
              "card-in rounded-lg py-1.5 text-sm tabular-nums transition enabled:active:scale-90",
              got ? "bg-ok/10 text-ok/70" : on ? "scale-105 bg-accent text-white" : "bg-panel-2 text-fg/80 hover:bg-accent/20",
            )}
            style={{ "--i": Math.min(i, 24) * 0.4 } as React.CSSProperties}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

const runsLabel = (runs: { from: number; to: number }[]) => runs.map((r) => (r.from === r.to ? r.from : `${r.from}–${r.to}`)).join(", ");

/**
 * The current entry's request button, at the top of its page. With more than one episode it opens a menu: all of it,
 * or pick episodes by number (each run of consecutive ones goes as one request). `have` are the downloaded ones.
 */
/** A menu that drops from a button: fixed to the window so the hero (which clips its backdrop) doesn't cut it off. */
function useDropdown(onClose: () => void) {
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const open = pos !== null;
  const measure = () => {
    const r = btn.current!.getBoundingClientRect();
    const width = Math.min(320, innerWidth - 16);
    setPos({ left: Math.max(8, Math.min(r.left, innerWidth - width - 8)), top: r.bottom + 6, width });
  };
  const close = () => {
    setPos(null);
    onClose();
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !btn.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return { btn, menu, pos, open, measure, close };
}
const OPTION = "flex w-full flex-col items-start rounded-lg px-3 py-2.5 text-left outline-none hover:bg-panel-2 focus-visible:bg-panel-2";
const Chevron = ({ back }: { back?: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={back ? "h-4 w-4" : "ml-auto h-4 w-4 text-muted"} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d={back ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
  </svg>
);

export function RequestThis({ entry, have = [] }: { entry: AnimeEntryOption; have?: number[] }) {
  const { busy, sent, problem, run } = useSubmit();
  const [picking, setPicking] = useState(false);
  const [eps, setEps] = useState<Set<number>>(new Set());
  // null until the saved choice is read, so the jelly doesn't slide over to it on every visit.
  const [dub, setDub] = useState<boolean | null>(null);
  const { btn, menu, pos, open, measure, close } = useDropdown(() => {
    setPicking(false);
    setEps(new Set());
  });

  // The last choice sticks, for whoever's browser this is.
  useEffect(() => {
    try {
      setDub(localStorage.getItem("request:dub") === "1");
    } catch {}
  }, []);
  const pickDub = (on: boolean) => {
    setDub(on);
    try {
      localStorage.setItem("request:dub", on ? "1" : "0");
    } catch {}
  };

  const request = (episodes?: { from: number; to: number }[]) => {
    close();
    const base = { kind: "anime", anilistIds: [entry.id], ...(entry.canDub && dub ? { dub: true } : {}) };
    run(episodes ? episodes.map((r) => ({ ...base, episodes: r })) : base);
  };

  if (!entry.mapped) return <p className="text-sm text-bad">Can&apos;t request this yet: no TVDB/TMDB mapping.</p>;
  const total = entry.episodes ?? 0;
  const done = entry.status === "available" ? "Available" : entry.requested ? "Requested" : undefined;
  const runs = episodeRuns([...eps]);
  const toggle = (n: number) => setEps((s) => flip(s, n));
  const option = OPTION;

  return (
    <div>
      <div className="flex items-center gap-2">
        <SendButton
          label="Request"
          done={done}
          busy={busy}
          sent={sent}
          buttonRef={btn}
          expanded={total > 1 ? open : undefined}
          onClick={() => (total <= 1 ? request() : open ? close() : measure())}
        />
        {entry.canDub && !done && !busy && !sent && dub !== null && (
          <Tabs
            className="flex gap-1.5"
            tabs={[
              { key: "sub", label: "Sub" },
              { key: "dub", label: "Dub" },
            ]}
            active={dub ? "dub" : "sub"}
            onSelect={(k) => pickDub(k === "dub")}
          />
        )}
      </div>
      <Problem text={problem} />
      {pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            className="menu menu-in fixed z-[60] overflow-hidden"
            style={{ left: pos.left, top: pos.top, width: pos.width, transformOrigin: "top left" }}
          >
            {/* Keyed by view, so switching slides the new one in from its side. */}
            <div key={String(picking)} className={picking ? "menu-slide-l" : "menu-slide-r"}>
              {!picking ? (
                <>
                  <button role="menuitem" className={option} onClick={() => request()}>
                    <span className="text-sm font-medium">All episodes</span>
                    <span className="text-xs text-muted">The full season, {total} episodes</span>
                  </button>
                  <button role="menuitem" className={option} onClick={() => setPicking(true)}>
                    <span className="flex w-full items-center text-sm font-medium">
                      Pick episodes
                      <svg viewBox="0 0 24 24" aria-hidden className="ml-auto h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </span>
                    <span className="text-xs text-muted">Only the ones you choose</span>
                  </button>
                </>
              ) : (
                <div className="p-2">
                  <div className="mb-2 flex items-center gap-2 text-sm">
                    <button className="-ml-1 rounded-md p-1 text-muted hover:text-fg" onClick={() => setPicking(false)} aria-label="Back">
                      <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 6-6 6 6 6" />
                      </svg>
                    </button>
                    <span className="font-medium">Pick episodes</span>
                    {eps.size > 0 && (
                      <button className="ml-auto text-xs text-accent hover:underline" onClick={() => setEps(new Set())}>
                        Clear
                      </button>
                    )}
                  </div>
                  <EpisodeGrid total={total} have={have} picked={eps} onToggle={toggle} className="grid-cols-6" />
                  <button className="btn-primary mt-3 w-full" disabled={!eps.size} onClick={() => request(runs)}>
                    {!eps.size
                      ? "Tap episodes to pick them"
                      : `Request ${eps.size === 1 ? "ep" : "eps"} ${runsLabel(runs)}`}
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
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
  /** `className` overrides the tone's colours. */
  chips: { label: string; tone: Tone; className?: string }[];
  selectable: boolean;
  /** The page you're on. */
  current?: boolean;
  /** Small print under the tile (e.g. the Sonarr target, for admins). */
  note?: { text: string; bad?: boolean };
  /** Episodes you can pick from (null = count unknown); absent when it has no episodes to pick. */
  episodes?: number | null;
  /** The downloaded ones, which can't be picked. */
  have?: number[];
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
  onRequest?: (ids: number[], episodes?: Range) => unknown;
}) {
  const { busy, sent, problem, run } = useSubmit((id) => items.find((i) => i.id === id)?.title);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [eps, setEps] = useState<Set<number>>(new Set());
  const pick = (ids: Set<number>) => {
    setPicked(ids);
    setEps(new Set());
  };
  const toggle = (id: number) => pick(picked.has(id) ? new Set([...picked].filter((x) => x !== id)) : new Set([...picked, id]));
  const allOpen = items.filter((i) => i.selectable).map((i) => i.id);
  // Episodes can be picked from one tile at a time; none picked means all of it.
  const one = picked.size === 1 ? items.find((i) => picked.has(i.id)) : undefined;
  const total = one?.episodes && one.episodes > 1 ? one.episodes : 0;
  const runs = total ? episodeRuns([...eps]) : [];

  return (
    <section className="card mb-10 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="font-semibold">{heading}</h3>
        {count && <span className="text-sm text-muted">{count}</span>}
        {onRequest && allOpen.length > 1 && (
          <button className="text-sm text-accent hover:underline" onClick={() => pick(picked.size === allOpen.length ? new Set() : new Set(allOpen))}>
            {picked.size === allOpen.length ? "Clear" : "Select all missing"}
          </button>
        )}
        {onRequest && (allOpen.length > 0 || picked.size > 0 || sent) && (
          <div className="ml-auto">
            <SendButton
              label={runs.length ? `Request ${eps.size === 1 ? "ep" : "eps"} ${runsLabel(runs)}` : picked.size ? `Request ${picked.size}` : "Pick to request"}
              busy={busy}
              sent={sent}
              disabled={picked.size === 0}
              // Each run of consecutive episodes goes as one request.
              onClick={async () => (await run(runs.length ? runs.map((r) => onRequest([...picked], r)) : onRequest([...picked]))) && pick(new Set())}
            />
          </div>
        )}
      </div>
      {total > 0 && (
        <div className="mb-4 rounded-xl bg-panel-2/40 p-3">
          <div className="mb-2 flex items-center gap-3 text-sm">
            <span className="font-medium">Pick episodes of {one!.title}</span>
            <span className="text-muted">{eps.size ? `${eps.size} picked` : "or leave them all off for the whole season"}</span>
            {eps.size > 0 && (
              <button className="ml-auto text-xs text-accent hover:underline" onClick={() => setEps(new Set())}>
                Clear
              </button>
            )}
          </div>
          <EpisodeGrid total={total} have={one!.have} picked={eps} onToggle={(n) => setEps((s) => flip(s, n))} className="grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))]" />
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
                    <span key={c.label} className={clsx("chip-in rounded px-1.5 py-0.5", c.className ?? TONE[c.tone])}>
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
  /** Downloaded episode numbers. */
  have?: number[];
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
    have: s.have,
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

/**
 * Request a manga for Mangarr, the same dropdown as an anime's Request: every chapter, or from a chapter on (e.g.
 * where the anime stops). Then new chapters follow on their own.
 */
export function RequestManga({ anilistId, done, have }: { anilistId: number; done?: string; have?: boolean }) {
  const { busy, sent, problem, run } = useSubmit();
  const [picking, setPicking] = useState(false);
  const [from, setFrom] = useState("");
  const { btn, menu, pos, open, measure, close } = useDropdown(() => {
    setPicking(false);
    setFrom("");
  });
  const start = Number(from);
  const ok = from !== "" && Number.isFinite(start) && start >= 0;
  const request = (startChapter?: number) => {
    close();
    run({ kind: "manga", anilistId, ...(startChapter ? { startChapter } : {}) });
  };

  return (
    <div>
      <SendButton label="Request" done={done} busy={busy} sent={sent} buttonRef={btn} expanded={open} onClick={() => (open ? close() : measure())} />
      <Problem text={problem} />
      {pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            className="menu menu-in fixed z-[60] overflow-hidden"
            style={{ left: pos.left, top: pos.top, width: pos.width, transformOrigin: "top left" }}
          >
            <div key={String(picking)} className={picking ? "menu-slide-l" : "menu-slide-r"}>
              {!picking ? (
                <>
                  <button role="menuitem" className={OPTION} onClick={() => request()}>
                    <span className="text-sm font-medium">All chapters</span>
                    <span className="text-xs text-muted">{have ? "Also the ones before what's here" : "From chapter 1"}, then new ones as they come out</span>
                  </button>
                  <button role="menuitem" className={OPTION} onClick={() => setPicking(true)}>
                    <span className="flex w-full items-center text-sm font-medium">
                      From a chapter
                      <Chevron />
                    </span>
                    <span className="text-xs text-muted">E.g. where the anime stops</span>
                  </button>
                </>
              ) : (
                <form
                  className="p-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (ok) request(start);
                  }}
                >
                  <div className="mb-2 flex items-center gap-2 text-sm">
                    <button type="button" className="-ml-1 rounded-md p-1 text-muted hover:text-fg" onClick={() => setPicking(false)} aria-label="Back">
                      <Chevron back />
                    </button>
                    <span className="font-medium">From a chapter</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    placeholder="Chapter"
                    autoFocus
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="input w-full"
                    aria-label="Start from chapter"
                  />
                  <button className="btn-primary mt-3 w-full" disabled={!ok}>
                    {ok ? `Request from ch. ${start}` : "Type a chapter number"}
                  </button>
                </form>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

