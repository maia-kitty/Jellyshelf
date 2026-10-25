"use client";

import Link from "next/link";
import type { DownloadProgress } from "@/lib/downloads";
import { DownloadBar } from "../DownloadBar";
import { ShelfHeader } from "../MediaCard";
import { sized } from "@/lib/img";

export interface InFlight {
  id: number;
  title: string;
  poster: string | null;
  href: string;
  /** What was asked for, e.g. "Season 2" or "Movie". */
  scope: string;
  state: "pending" | "searching" | "downloading" | "upcoming";
  download: DownloadProgress | null;
  /** For anime that hasn't started airing, e.g. "Airs Winter 2027" or "Air date TBA". */
  airs: string | null;
}

const STATE_TEXT = { pending: "Waiting for approval", searching: "Looking for a release" } as const;

/** Your requests that haven't landed yet, with live download progress. */
export function OnItsWay({ items }: { items: InFlight[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-10">
      <ShelfHeader title="On its way" note={`${items.length} request${items.length === 1 ? "" : "s"}`} href="/requests" />
      <ul className="bounce-y grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={it.href} className="flex gap-3 rounded-xl border border-line bg-panel p-2.5 transition hover:border-muted">
              {it.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img {...sized(it.poster, 44)} alt="" loading="lazy" decoding="async" className="h-16 w-11 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-16 w-11 shrink-0 rounded-md bg-panel-2" />
              )}
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <div className="truncate text-sm font-medium">{it.title}</div>
                <div className="mb-1.5 text-xs text-muted">{it.scope}</div>
                {it.download ? (
                  <DownloadBar d={it.download} />
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span
                      className={
                        it.state === "pending" ? "h-1.5 w-1.5 rounded-full bg-warn" : it.state === "upcoming" ? "h-1.5 w-1.5 rounded-full bg-muted" : "h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
                      }
                    />
                    {it.state === "upcoming" ? it.airs : STATE_TEXT[it.state === "downloading" ? "searching" : it.state]}
                  </div>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
