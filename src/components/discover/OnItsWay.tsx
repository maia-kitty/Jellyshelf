"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DownloadProgress } from "@/lib/downloads";
import { DownloadBar } from "../DownloadBar";
import { HomePanel, PanelList } from "./ContinueRow";
import { sized } from "@/lib/img";

export interface InFlight {
  id: number;
  title: string;
  poster: string | null;
  href: string;
  /** What was asked for, e.g. "Season 2" or "Movie". */
  scope: string;
  state: "pending" | "searching" | "downloading" | "upcoming" | "releasing";
  download: DownloadProgress | null;
  /** For anime that hasn't started airing, e.g. "Airs Winter 2027" or "Air date TBA". */
  airs: string | null;
  /** For anime that's airing, the next episode and when (unix seconds), if AniList knows. */
  nextEp: { episode: number; at: number } | null;
}

const STATE_TEXT = { pending: "Waiting for approval", searching: "Looking for a release" } as const;

/** Your requests that haven't landed yet, with live download progress: the newest large, the rest listed. */
export function OnItsWay({ items }: { items: InFlight[] }) {
  if (!items.length) return null;
  const [top, ...rest] = items;
  return (
    <HomePanel art={top.poster} title="On its way" note={`${items.length} request${items.length === 1 ? "" : "s"}`} href="/requests">
      <Link prefetch={false} href={top.href} className="group flex gap-4 p-4">
        {top.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img {...sized(top.poster, 112)} alt="" decoding="async" className="h-36 w-24 shrink-0 rounded-lg object-cover shadow-lg" />
        ) : (
          <div className="h-36 w-24 shrink-0 rounded-lg bg-panel-2" />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-fg/60">{top.scope}</div>
          <div className="mt-0.5 line-clamp-2 text-lg font-semibold leading-snug group-hover:underline">{top.title}</div>
          <div className="mt-auto">
            <State it={top} />
          </div>
        </div>
      </Link>
      {rest.length > 0 && (
        <PanelList>
          {rest.map((it) => (
            <li key={it.id}>
              <Link prefetch={false} href={it.href} className="flex gap-3 rounded-lg p-2 transition hover:bg-panel-2">
                {it.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img {...sized(it.poster, 40)} alt="" decoding="async" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded-md bg-panel-2" />
                )}
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <div className="truncate text-sm font-medium">{it.title}</div>
                  <div className="mb-1 text-xs text-muted">{it.scope}</div>
                  <State it={it} />
                </div>
              </Link>
            </li>
          ))}
        </PanelList>
      )}
    </HomePanel>
  );
}

/** Where a request is: its download, or a dot and a few words. */
function State({ it }: { it: InFlight }) {
  if (it.download) return <DownloadBar d={it.download} />;
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span
        className={
          it.state === "pending" ? "h-1.5 w-1.5 rounded-full bg-warn" : it.state === "upcoming" || it.state === "releasing" ? "h-1.5 w-1.5 rounded-full bg-muted" : "h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
        }
      />
      {it.state === "upcoming" ? it.airs : it.state === "releasing" ? <NextEp next={it.nextEp} /> : STATE_TEXT[it.state === "downloading" ? "searching" : it.state]}
    </div>
  );
}

/** "Ep 6 airs Sat 1 Nov", in the viewer's timezone, so it's filled in once in the browser (the server's may differ). */
function NextEp({ next }: { next: { episode: number; at: number } | null }) {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    if (next) setDate(new Date(next.at * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }));
  }, [next]);
  return next && date ? `Ep ${next.episode} airs ${date}` : "Releasing";
}
