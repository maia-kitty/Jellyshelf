"use client";

import Link from "next/link";
import type { LibraryItem } from "@/lib/library";
import { ShelfHeader } from "./MediaCard";
import { sized } from "@/lib/img";
import { FadeImg } from "./FadeImg";

const JELLY = "linear-gradient(90deg, #aa5cc3, #00a4dc)";

/** A title you own: opens its page; the play button on hover starts it (or resumes, or the next episode). */
export function LibraryCard({ item }: { item: LibraryItem }) {
  return (
    <div className="group relative">
      <Link href={item.href} className="block" title={item.title}>
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
        <div className="mt-2 line-clamp-2 text-sm font-medium leading-tight">{item.title}</div>
        <div className="mt-0.5 text-xs text-muted">
          {item.episode ? <span className="text-accent">New · {item.episode}</span> : [item.year, item.type === "Series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}
        </div>
      </Link>
      <Link
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

export function LibraryRow({ title, href, items }: { title: string; href?: string; items: LibraryItem[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-10">
      <ShelfHeader title={title} href={href} />
      <div className="scroll-row -mx-1 flex gap-4 overflow-x-auto px-1 pb-3 pt-1.5">
        {items.map((it, i) => (
          <div key={it.id} className="card-in w-36 shrink-0 sm:w-40" style={{ "--i": i } as React.CSSProperties}>
            <LibraryCard item={it} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function LibraryGrid({ items }: { items: LibraryItem[] }) {
  if (!items.length) return <p className="py-16 text-center text-muted">Nothing here.</p>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
      {items.map((it, i) => (
        <div key={it.id} className="card-in" style={{ "--i": i } as React.CSSProperties}>
          <LibraryCard item={it} />
        </div>
      ))}
    </div>
  );
}
