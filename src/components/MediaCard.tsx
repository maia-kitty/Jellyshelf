import Link from "next/link";
import clsx from "clsx";
import type { Card } from "@/lib/cards";
import { ListBadge, StatusBadge } from "./StatusBadge";

export function MediaCard({ card }: { card: Card }) {
  return (
    <Link href={card.href} className="group block w-full" title={card.title}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-line bg-panel-2 transition group-hover:border-accent">
        {card.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.poster} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-sm text-muted">{card.title}</div>
        )}
        <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
          <StatusBadge status={card.status} />
          {card.list && <ListBadge status={card.list.status} progress={card.list.progress} />}
        </div>
        {(!!card.score || !!card.genres?.length) && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-1.5 pt-8">
            {!!card.genres?.length && (
              <div className="mb-1 hidden text-[11px] leading-snug text-white/85 group-hover:block">{card.genres.join(" · ")}</div>
            )}
            {!!card.score && (
              <span className={clsx("text-xs font-semibold tabular-nums", card.score >= 75 ? "text-ok" : card.score >= 60 ? "text-white" : "text-white/60")}>
                ★ {card.score}
              </span>
            )}
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

export function CardRow({ title, href, cards }: { title: string; href?: string; cards: Card[] }) {
  if (!cards.length) return null;
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="text-sm text-muted hover:text-fg">
            See all →
          </Link>
        )}
      </div>
      <div className="scroll-row -mx-1 flex gap-4 overflow-x-auto px-1 pb-3">
        {cards.map((c) => (
          <div key={`${c.kind}:${c.id}`} className="w-36 shrink-0 sm:w-40">
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
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
      {cards.map((c) => (
        <MediaCard key={`${c.kind}:${c.id}`} card={c} />
      ))}
    </div>
  );
}
