"use client";

import Link from "next/link";
import clsx from "clsx";
import type { LibraryItem } from "@/lib/library";
import { ShelfHeader } from "./MediaCard";
import { sized } from "@/lib/img";
import { FadeImg } from "./FadeImg";
import { JellyfinButton } from "./Episodes";

const JELLY = "linear-gradient(90deg, #aa5cc3, #00a4dc)";

/** A title you own: opens its page; the play button on hover starts it (or resumes, or the next episode). */
export function LibraryCard({ item, bare = false }: { item: LibraryItem; bare?: boolean }) {
  return (
    <div className="group relative">
      <Link prefetch={false} href={item.href} className="block" title={item.title}>
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-line bg-panel-2 transition duration-300 ease-out group-hover:-translate-y-1 group-hover:border-accent group-hover:shadow-[0_10px_30px_-10px_color-mix(in_srgb,var(--color-accent)_55%,transparent)]">
          {item.poster ? (
            <FadeImg fast {...sized(item.poster, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.05]" />
          ) : (
            <div className="flex h-full items-center justify-center p-3 text-center text-sm text-muted">{item.title}</div>
          )}
          {item.played ? (
            <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ok text-xs font-bold text-black" title="Watched">
              ✓
            </span>
          ) : item.unplayed ? (
            <span className="absolute right-1.5 top-1.5 min-w-6 rounded-full bg-accent px-1.5 py-0.5 text-center text-[11px] font-bold text-white" title={`${item.unplayed} unwatched`}>
              {item.unplayed}
            </span>
          ) : null}
          {item.progress !== null && item.progress > 0 && !item.played && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
              <div className="h-full" style={{ width: `${Math.round(item.progress * 100)}%`, backgroundImage: JELLY }} />
            </div>
          )}
        </div>
        {!bare && <div className="mt-2 line-clamp-2 text-sm font-medium leading-tight">{item.title}</div>}
        {!bare && <div className="mt-0.5 text-xs text-muted">
          {item.episode ? <span className="text-accent">New · {item.episode}</span> : [item.year, item.type === "Series" ? "Series" : item.type === "Movie" ? "Movie" : item.type === "Manga" ? "Manga" : null].filter(Boolean).join(" · ")}
        </div>}
      </Link>
      <Link prefetch={false}
        href={item.playHref}
        aria-label={`Play ${item.title}`}
        className="absolute left-1/2 top-[33%] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 scale-75 items-center justify-center rounded-full text-white opacity-0 shadow-xl transition duration-300 group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100"
        style={{ backgroundImage: JELLY }}
      >
        <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden>
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </Link>
    </div>
  );
}

/**
 * Library home: one library as a panel. Its newest title gets the room (backdrop, synopsis, Play), the ones after it
 * sit small underneath.
 */
export function LibraryPanel({ title, href, items }: { title: string; href?: string; items: LibraryItem[] }) {
  if (!items.length) return null;
  const [top, ...rest] = items;
  return (
    // Stretched to its grid row, so the two panels side by side end level even when one has a single title.
    <section className="flex min-w-0 flex-col">
      <ShelfHeader title={title} href={href} />
      <div className="card flex-1 overflow-hidden">
        <Featured item={top} />
        {rest.length > 0 && (
          <div className="scroll-row flex gap-3 overflow-x-auto px-4 pb-3 pt-1.5">
            {rest.map((it, i) => (
              <div key={it.id} className="card-in w-24 shrink-0 sm:w-28" style={{ "--i": i } as React.CSSProperties}>
                <LibraryCard item={it} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Featured({ item }: { item: LibraryItem }) {
  const bg = item.backdrop ?? item.poster;
  const kind = item.type === "Series" ? "Series" : item.type === "Movie" ? "Movie" : item.type === "Manga" ? "Manga" : null;
  return (
    <div className="relative flex gap-4 p-4">
      {bg && (
        // A poster standing in for a missing backdrop is blurred, so it reads as colour rather than a second poster.
        <FadeImg {...sized(bg, 800)} alt="" aria-hidden loading="lazy" decoding="async" className={clsx("absolute inset-0 h-full w-full object-cover opacity-40", !item.backdrop && "scale-110 blur-2xl")} />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-panel via-panel/85 to-panel/40" />
      <div className="relative w-24 shrink-0 sm:w-28">
        <LibraryCard item={item} bare />
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="text-xs font-medium text-accent">{item.episode ? `New · ${item.episode}` : "Just added"}</div>
        <Link prefetch={false} href={item.href} className="mt-0.5 line-clamp-2 text-lg font-semibold leading-tight hover:underline">
          {item.title}
        </Link>
        <div className="mt-0.5 text-xs text-muted">{[item.year, kind].filter(Boolean).join(" · ")}</div>
        {item.overview && <p className="mt-2 line-clamp-3 text-sm text-fg/80">{item.overview}</p>}
        <div className="mt-auto pt-3">
          <JellyfinButton href={item.playHref} label={item.type === "Manga" ? "Read" : "Play"} />
        </div>
      </div>
    </div>
  );
}

export function LibraryGrid({ items }: { items: LibraryItem[] }) {
  if (!items.length) return <p className="py-16 text-center text-muted">Nothing here.</p>;
  return (
    <div className="bounce-y grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
      {items.map((it, i) => (
        <div key={it.id} className="card-in" style={{ "--i": i } as React.CSSProperties}>
          <LibraryCard item={it} />
        </div>
      ))}
    </div>
  );
}
