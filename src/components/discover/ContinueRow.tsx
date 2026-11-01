"use client";

import Link from "next/link";
import type { Card } from "@/lib/cards";
import { ShelfHeader } from "../MediaCard";
import { sized } from "@/lib/img";

const JELLY = "linear-gradient(90deg, #aa5cc3, #00a4dc)";
const KIND = { anime: "Anime", tv: "Series", manga: "Manga", movie: "Movie" } as Record<string, string>;

/**
 * One of the home page's side-by-side panels (Continue watching, Continue reading, On its way): stretched to its grid
 * row so neighbours end level, the first item large and the rest listed under it.
 */
export function HomePanel({ title, note, href, children }: { title: string; note?: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col">
      <ShelfHeader title={title} note={note} href={href} />
      <div className="card flex flex-1 flex-col overflow-hidden">{children}</div>
    </section>
  );
}
/** The panel's list under its first item; scrolls (drag too) once it's long. */
export const PanelList = ({ children }: { children: React.ReactNode }) => <ul className="bounce-y max-h-[19rem] overflow-y-auto px-2 pb-2">{children}</ul>;

function Progress({ value, thin = false }: { value: number | undefined; thin?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`${thin ? "h-1" : "h-1.5"} flex-1 overflow-hidden rounded-full bg-white/10`}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.round((value ?? 0) * 100))}%`, backgroundImage: JELLY }} />
      </div>
      {value !== undefined && !thin && <span className="text-[11px] tabular-nums text-fg/60">{Math.round(value * 100)}%</span>}
    </div>
  );
}

/** Things you're part-way through: the latest one large (art blurred behind, where you're up to, progress), the rest listed. */
export function ContinueRow({ cards, title = "Continue watching" }: { cards: Card[]; title?: string }) {
  if (!cards.length) return null;
  const [top, ...rest] = cards;
  return (
    <HomePanel title={title}>
      {/* Opens the title's page, where Play picks up at the right episode. */}
      <Link prefetch={false} href={top.href} aria-label={top.title} className="group relative flex gap-4 p-4">
        {top.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img {...sized(top.poster, 48)} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-2xl" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-panel/80 to-panel/20" />
        {top.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img {...sized(top.poster, 112)} alt="" loading="lazy" decoding="async" className="relative h-36 w-24 shrink-0 rounded-lg object-cover shadow-lg transition group-hover:scale-[1.03]" />
        ) : (
          <div className="relative h-36 w-24 shrink-0 rounded-lg bg-panel-2" />
        )}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-fg/60">{KIND[top.kind] ?? "Movie"}</div>
          <div className="mt-0.5 line-clamp-2 text-lg font-semibold leading-snug group-hover:underline">{top.title}</div>
          {top.sub && <div className="mt-1 text-sm text-fg/75">{top.sub}</div>}
          <div className="mt-auto">
            <Progress value={top.watched} />
          </div>
        </div>
      </Link>
      {rest.length > 0 && (
        <PanelList>
          {rest.map((c, i) => (
            <li key={`${c.kind}:${c.id}`} className="card-in" style={{ "--i": i } as React.CSSProperties}>
              <Link prefetch={false} href={c.href} className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-panel-2">
                {c.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img {...sized(c.poster, 40)} alt="" loading="lazy" decoding="async" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded-md bg-panel-2" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.title}</div>
                  {c.sub && <div className="mb-1 truncate text-xs text-muted">{c.sub}</div>}
                  <Progress value={c.watched} thin />
                </div>
              </Link>
            </li>
          ))}
        </PanelList>
      )}
    </HomePanel>
  );
}
