"use client";

import Link from "next/link";
import type { Card } from "@/lib/cards";
import { ShelfHeader } from "../MediaCard";
import { StatusBadge } from "../StatusBadge";
import { sized } from "@/lib/img";

/** A ranked row: big outlined numbers tucked behind each poster. */
export function TopTen({ title, href, note, cards }: { title: string; href?: string; note?: string; cards: Card[] }) {
  if (!cards.length) return null;
  return (
    <section className="mb-10">
      <ShelfHeader title={title} href={href} note={note} />
      <ol className="scroll-row -mx-1 flex gap-1 overflow-x-auto px-1 pb-3 pt-1.5">
        {cards.map((c, i) => (
          <li key={`${c.kind}:${c.id}`} className="card-in shrink-0" style={{ "--i": i } as React.CSSProperties}>
            <Link href={c.href} className="group flex items-end" title={c.title}>
              <span
                aria-hidden
                className="-mr-3 select-none text-[7.5rem] font-black leading-[0.8] tracking-tighter text-transparent transition group-hover:[-webkit-text-stroke-color:var(--color-accent)] sm:text-[9rem]"
                style={{ WebkitTextStroke: "2px color-mix(in srgb, var(--color-muted) 55%, transparent)" }}
              >
                {i + 1}
              </span>
              <span className="relative block w-28 sm:w-32">
                <span className="relative block aspect-[2/3] overflow-hidden rounded-xl border border-line bg-panel-2 shadow-xl transition duration-300 ease-out group-hover:-translate-y-1 group-hover:border-accent">
                  {c.poster && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img {...sized(c.poster, 128)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                  )}
                  <span className="absolute left-1.5 top-1.5">
                    <StatusBadge status={c.status} />
                  </span>
                  {!!c.score && (
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-6 text-xs font-semibold text-ok">★ {c.score}</span>
                  )}
                </span>
                <span className="sr-only">
                  {i + 1}. {c.title}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
