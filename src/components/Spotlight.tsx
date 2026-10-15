"use client";

import Link from "next/link";
import clsx from "clsx";
import { useRef, useState } from "react";
import type { Card } from "@/lib/cards";
import { ListBadge, StatusBadge } from "./StatusBadge";

export interface SpotlightItem {
  card: Card;
  banner: string;
  description: string;
  /** e.g. "Trending anime" */
  label: string;
}

const ROTATE_MS = 8000;
const JELLY = "linear-gradient(90deg, #aa5cc3, #00a4dc)";

/** Full-bleed banner of trending titles at the top of Discover; rotates on its own, pausing while hovered. */
export function Spotlight({ items }: { items: SpotlightItem[] }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  const touchX = useRef<number | null>(null);

  const go = (delta: number) => setI((n) => (n + delta + items.length) % items.length);

  if (!items.length) return null;
  const arrow =
    "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/40 text-xl text-white/80 opacity-0 backdrop-blur transition hover:bg-black/60 hover:text-white group-hover/spot:opacity-100 focus-visible:opacity-100 sm:flex";

  return (
    <section
      className="group/spot bleed relative -mt-6 mb-10 overflow-hidden"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touchX.current ?? e.changedTouches[0].clientX);
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {items.map((it, n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${it.card.kind}:${it.card.id}`}
          src={it.banner}
          alt=""
          // The current banner drifts slowly closer while it's up, and eases back as it fades out.
          className={clsx("absolute inset-0 h-full w-full object-cover", n === i ? "opacity-80 motion-safe:scale-[1.07]" : "opacity-0")}
          style={{ transition: "opacity 1s ease, transform 9s cubic-bezier(0.2, 0.6, 0.3, 1)" }}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg/85 via-bg/30 to-transparent" />

      {/* Every slide sits in the same grid cell, so the banner is always as tall as its tallest slide and never
          jumps when a long title or synopsis comes round. Only the current one is visible. */}
      <div className="relative grid min-h-[340px] pb-10 pt-16 sm:min-h-[420px] sm:px-8 min-[1720px]:px-0">
        {items.map((it, n) => (
          <Slide key={`${it.card.kind}:${it.card.id}`} item={it} active={n === i} />
        ))}
      </div>

      {items.length > 1 && (
        <>
          <button aria-label="Previous" onClick={() => go(-1)} className={clsx(arrow, "left-3")}>
            ‹
          </button>
          <button aria-label="Next" onClick={() => go(1)} className={clsx(arrow, "right-3")}>
            ›
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            {items.map((it, n) => (
              <button
                key={`${it.card.kind}:${it.card.id}`}
                aria-label={`Show ${it.card.title}`}
                aria-current={n === i}
                onClick={() => setI(n)}
                className={clsx(
                  "relative h-2 overflow-hidden rounded-full transition-all duration-300",
                  n === i ? "w-14 bg-white/15" : "w-2 opacity-45 hover:opacity-80",
                )}
                style={n === i ? undefined : { backgroundImage: JELLY }}
              >
                {n === i && (
                  // The fill is the timer: when it finishes we advance. It pauses with the hover, and with reduced
                  // motion it never runs, so slides only change by hand.
                  <span
                    key={i}
                    onAnimationEnd={(e) => e.target === e.currentTarget && go(1)}
                    className="spotlight-progress absolute inset-0 overflow-hidden rounded-full"
                    style={{ animationDuration: `${ROTATE_MS}ms`, animationPlayState: hold ? "paused" : "running" }}
                  >
                    <span className="absolute inset-0" style={{ backgroundImage: JELLY }} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Slide({ item: { card, label, description }, active }: { item: SpotlightItem; active: boolean }) {
  return (
    <div
      aria-hidden={!active}
      inert={!active}
      className={clsx("flex items-end gap-6 self-end [grid-area:1/1]", active ? "rise-in" : "invisible")}
    >
      <Link href={card.href} className="hidden w-36 shrink-0 md:block" tabIndex={active ? undefined : -1}>
        {card.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.poster} alt="" loading="lazy" className="aspect-[2/3] w-full rounded-xl border border-line object-cover shadow-2xl" />
        )}
      </Link>
      <div className="min-w-0 max-w-2xl flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-widest text-accent">{label}</span>
          <StatusBadge status={card.status} />
          {card.list && <ListBadge status={card.list.status} progress={card.list.progress} />}
        </div>
        <h2 className="line-clamp-2 text-3xl font-bold leading-tight drop-shadow sm:text-4xl">
          <Link href={card.href} className="hover:underline">
            {card.title}
          </Link>
        </h2>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-fg/75">
          {card.year && <span>{card.year}</span>}
          {card.sub && <span>{card.sub}</span>}
          {card.score ? <span>★ {card.score}%</span> : null}
          {card.genres?.map((g) => (
            <span key={g} className="text-fg/60">
              {g}
            </span>
          ))}
        </div>
        {description && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-fg/80">{description}</p>}
        <div className="mt-5 flex items-center gap-3">
          <Link href={card.href} className="btn-primary">
            View &amp; request
          </Link>
        </div>
      </div>
    </div>
  );
}
