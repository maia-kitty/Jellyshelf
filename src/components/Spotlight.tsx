"use client";

import Link from "next/link";
import clsx from "clsx";
import { useEffect, useState } from "react";
import type { Card } from "@/lib/cards";
import { ListBadge, StatusBadge } from "./StatusBadge";

export interface SpotlightItem {
  card: Card;
  banner: string;
  description: string;
}

const ROTATE_MS = 8000;

/** Full-bleed banner of trending titles at the top of Discover; rotates until you hover it. */
export function Spotlight({ items }: { items: SpotlightItem[] }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);

  useEffect(() => {
    if (hold || items.length < 2) return;
    const t = setTimeout(() => setI((n) => (n + 1) % items.length), ROTATE_MS);
    return () => clearTimeout(t);
  }, [i, hold, items.length]);

  if (!items.length) return null;
  const { card } = items[i];

  return (
    <section
      className="relative -mx-4 -mt-6 mb-10 overflow-hidden sm:-mx-6"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
    >
      {items.map((it, n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={it.card.id}
          src={it.banner}
          alt=""
          className={clsx("absolute inset-0 h-full w-full object-cover transition-opacity duration-1000", n === i ? "opacity-80" : "opacity-0")}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg/85 via-bg/30 to-transparent" />

      <div className="relative flex min-h-[340px] items-end gap-6 px-4 pb-8 pt-16 sm:min-h-[400px] sm:px-6">
        <Link href={card.href} className="hidden w-36 shrink-0 md:block">
          {card.poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={card.id} src={card.poster} alt="" className="spotlight-in w-full rounded-xl border border-line shadow-2xl" />
          )}
        </Link>
        <div key={card.id} className="spotlight-in min-w-0 max-w-2xl flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold uppercase tracking-widest text-accent">#{i + 1} trending</span>
            <StatusBadge status={card.status} />
            {card.list && <ListBadge status={card.list.status} progress={card.list.progress} />}
          </div>
          <h2 className="text-3xl font-bold leading-tight drop-shadow sm:text-4xl">
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
          {items[i].description && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-fg/80">{items[i].description}</p>}
          <div className="mt-5 flex items-center gap-3">
            <Link href={card.href} className="btn-primary">
              View &amp; request
            </Link>
          </div>
        </div>
      </div>

      {items.length > 1 && (
        <div className="absolute bottom-4 right-4 flex gap-1.5 sm:right-6">
          {items.map((it, n) => (
            <button
              key={it.card.id}
              aria-label={`Show ${it.card.title}`}
              onClick={() => setI(n)}
              className={clsx("h-1.5 rounded-full transition-all", n === i ? "w-6 bg-fg" : "w-1.5 bg-fg/40 hover:bg-fg/70")}
            />
          ))}
        </div>
      )}
    </section>
  );
}
