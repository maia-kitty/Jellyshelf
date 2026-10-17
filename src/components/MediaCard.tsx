"use client";

import Link from "next/link";
import clsx from "clsx";
import type { Card } from "@/lib/cards";
import { ListBadge, StatusBadge } from "./StatusBadge";
import { sized } from "@/lib/img";
import { FadeImg } from "./FadeImg";
import { scoreColor } from "@/lib/scoreColor";
import { CommunityScore } from "./Score";

export function MediaCard({ card }: { card: Card }) {
  return (
    <Link href={card.href} className="group block w-full" title={card.title}>
      {/* Lifts toward you on hover, with a faint accent glow. */}
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-line bg-panel-2 transition duration-300 ease-out group-hover:-translate-y-1 group-hover:border-accent group-hover:shadow-[0_10px_30px_-10px_color-mix(in_srgb,var(--color-accent)_55%,transparent)] group-active:translate-y-0 group-active:scale-[0.98]">
        {card.poster ? (
          <FadeImg fast {...sized(card.poster, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.05]" />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-sm text-muted">{card.title}</div>
        )}
        <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
          <StatusBadge status={card.status} />
          {card.list && <ListBadge status={card.list.status} progress={card.list.progress} />}
        </div>
        {(!!card.score || !!card.mine || !!card.genres?.length) && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-1.5 pt-8">
            {!!card.genres?.length && (
              <div className="mb-1 hidden text-[11px] leading-snug text-white/85 group-hover:block">{card.genres.join(" · ")}</div>
            )}
            <div className="flex items-baseline gap-2">
              {!!card.score && (
                <CommunityScore score={card.score} className="text-xs font-semibold tabular-nums" />
              )}
              {!!card.mine && (
                <span title="Your score" className="text-xs font-semibold tabular-nums">
                  <span className="text-white/70">You </span>
                  <span style={{ color: scoreColor(card.mine, 100) }}>{card.mine}</span>
                </span>
              )}
            </div>
          </div>
        )}
        {card.watched !== undefined && card.watched > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div className="h-full" style={{ width: `${Math.round(card.watched * 100)}%`, backgroundImage: "linear-gradient(90deg, #aa5cc3, #00a4dc)" }} />
          </div>
        )}
        {card.isAnime && card.kind !== "anime" && (
          <span className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-anilist">ANIME</span>
        )}
      </div>
      <div className="mt-2 line-clamp-2 text-sm font-medium leading-tight">{card.title}</div>
      <div className="mt-0.5 text-xs text-muted">
        {[card.year, card.sub].filter(Boolean).join(" · ")}
      </div>
    </Link>
  );
}

/** Heading for a home/discover section, with an optional "See all" link and a muted aside. */
export function ShelfHeader({ title, href, note, actions }: { title: React.ReactNode; href?: string; note?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
      {note && <span className="hidden min-w-0 truncate text-sm text-muted sm:inline">{note}</span>}
      {actions}
      {href && (
        <Link href={href} className="ml-auto shrink-0 text-sm text-muted hover:text-fg">
          See all →
        </Link>
      )}
    </div>
  );
}

export function CardRow({ title, href, cards, note }: { title: React.ReactNode; href?: string; cards: Card[]; note?: React.ReactNode }) {
  if (!cards.length) return null;
  return (
    <section className="mb-10">
      <ShelfHeader title={title} href={href} note={note} />
      {/* pt-1.5 leaves room for the hover lift inside the scroller's clip. */}
      <div className="scroll-row -mx-1 flex gap-4 overflow-x-auto px-1 pb-3 pt-1.5">
        {cards.map((c, i) => (
          <div key={`${c.kind}:${c.id}`} className="card-in w-36 shrink-0 sm:w-40" style={{ "--i": i } as React.CSSProperties}>
            <MediaCard card={c} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function CardGrid({ cards }: { cards: Card[] }) {
  if (!cards.length) return <p className="py-16 text-center text-muted">Nothing here.</p>;
  return (
    <div className="bounce-y grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
      {cards.map((c, i) => (
        <div key={`${c.kind}:${c.id}`} className="card-in" style={{ "--i": i } as React.CSSProperties}>
          <MediaCard card={c} />
        </div>
      ))}
    </div>
  );
}
