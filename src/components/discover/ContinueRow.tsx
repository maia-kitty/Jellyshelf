"use client";

import Link from "next/link";
import type { Card } from "@/lib/cards";
import { ShelfHeader } from "../MediaCard";
import { sized } from "@/lib/img";

const JELLY = "linear-gradient(90deg, #aa5cc3, #00a4dc)";

/** Wide cards for things you're part-way through: the art blurred behind, where you're up to, and a progress bar. */
export function ContinueRow({ cards }: { cards: Card[] }) {
  if (!cards.length) return null;
  return (
    <section className="mb-10">
      <ShelfHeader title="Continue watching" />
      <div className="scroll-row -mx-1 flex gap-4 overflow-x-auto px-1 pb-3 pt-1.5">
        {cards.map((c, i) => (
          <div key={`${c.kind}:${c.id}`} className="card-in group relative shrink-0 transition duration-300 ease-out hover:-translate-y-1" style={{ "--i": i } as React.CSSProperties}>
          {/* Opens the title's page, where Play picks up at the right episode. */}
          <Link prefetch={false}
            href={c.href}
            aria-label={c.title}
            className="relative flex h-36 w-72 overflow-hidden rounded-xl border border-line bg-panel transition duration-300 ease-out group-hover:border-accent active:scale-[0.98] sm:w-80"
          >
            {c.poster && (
              // eslint-disable-next-line @next/next/no-img-element
              <img {...sized(c.poster, 48)} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-2xl" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-bg/70 to-bg/20" />
            <div className="relative flex min-w-0 flex-1 gap-3 p-3">
              {c.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <span className="relative h-full w-[5rem] shrink-0">
                  <img {...sized(c.poster, 80)} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-lg object-cover shadow-lg transition group-hover:scale-[1.03]" />
                </span>
              ) : (
                <div className="h-full w-[5rem] shrink-0 rounded-lg bg-panel-2" />
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-fg/60">{c.kind === "anime" ? "Anime" : c.kind === "tv" ? "Series" : "Movie"}</div>
                <div className="mt-0.5 line-clamp-2 font-semibold leading-snug">{c.title}</div>
                {c.sub && <div className="mt-1 text-sm text-fg/75">{c.sub}</div>}
                <div className="mt-auto flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.round((c.watched ?? 0) * 100))}%`, backgroundImage: JELLY }} />
                  </div>
                  {c.watched !== undefined && <span className="text-[11px] tabular-nums text-fg/60">{Math.round(c.watched * 100)}%</span>}
                </div>
              </div>
            </div>
          </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
