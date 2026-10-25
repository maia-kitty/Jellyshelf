import Link from "next/link";
import clsx from "clsx";
import type { MediaStatus } from "@/db/schema";
import { aniTitle, FORMAT_LABEL, type AniMediaCard, type AniRelationType, type FranchiseMapEntry } from "@/lib/clients/anilist";
import { sized } from "@/lib/img";
import { ShelfHeader } from "./MediaCard";

const RELATION: Partial<Record<AniRelationType, string>> = {
  SIDE_STORY: "Side story",
  SPIN_OFF: "Spin-off",
  SUMMARY: "Recap",
  ALTERNATIVE: "Alternative",
  PARENT: "Main story",
  COMPILATION: "Compilation",
  CONTAINS: "Contains",
};

const facts = (m: AniMediaCard) => [m.format && FORMAT_LABEL[m.format], m.seasonYear].filter(Boolean).join(" · ");

/** A dot on what's in the library: full green when it's all there, faded when some of it is. */
function Have({ status }: { status?: MediaStatus }) {
  if (status !== "available" && status !== "partially_available") return null;
  return (
    <span
      title={status === "available" ? "In your library" : "Partly in your library"}
      className={clsx("absolute right-1 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-bg", status === "available" ? "bg-ok" : "bg-ok/50")}
    />
  );
}

/**
 * How a franchise fits together: the main story along a line, in airing order (films that carry it on included), and
 * under each entry what branches off it: side stories, spin-offs, recaps.
 */
export function FranchiseMap({ map, currentId, statuses }: { map: FranchiseMapEntry[]; currentId: number; statuses: Record<number, MediaStatus> }) {
  const count = map.reduce((n, m) => n + 1 + m.branches.length, 0);
  if (count < 2) return null;
  return (
    <section className="mb-10">
      <ShelfHeader title="Franchise map" note={`${count} entries`} />
      <ol className="scroll-row -mx-1 flex overflow-x-auto px-1 pb-3 pt-1">
        {map.map(({ entry, branches }, i) => {
          const here = entry.id === currentId;
          return (
            <li key={entry.id} className="relative isolate w-44 shrink-0">
              {/* The story line, from this cover's middle to the next one's. */}
              {i < map.length - 1 && <span aria-hidden className="absolute left-12 top-[4.5rem] -z-10 h-0.5 w-full bg-line" />}
              <Link href={`/anime/${entry.id}`} className="group block w-36" aria-current={here ? "page" : undefined}>
                <div className={clsx("relative h-36 w-24 overflow-hidden rounded-lg bg-panel-2 transition group-hover:-translate-y-0.5", here && "ring-2 ring-accent ring-offset-2 ring-offset-bg")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img {...sized(entry.coverImage.large, 96)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  <Have status={statuses[entry.id]} />
                </div>
                <div className={clsx("mt-2 line-clamp-2 text-sm leading-snug group-hover:underline", here && "text-accent")}>{aniTitle(entry.title)}</div>
                <div className="text-xs text-muted">{here ? "This page" : facts(entry)}</div>
              </Link>
              {branches.length > 0 && (
                <ul className="ml-12 mt-2 w-32 border-l-2 border-line">
                  {branches.map(({ entry: b, relation }) => (
                    <li key={b.id} className="relative pt-2.5 pl-3">
                      {/* the twig from the branch line to this entry */}
                      <span aria-hidden className="absolute left-0 top-[2.125rem] h-0.5 w-2 bg-line" />
                      <Link href={`/anime/${b.id}`} className="group flex gap-2" aria-current={b.id === currentId ? "page" : undefined}>
                        <div className={clsx("relative h-12 w-8 shrink-0 overflow-hidden rounded bg-panel-2", b.id === currentId && "ring-2 ring-accent")}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img {...sized(b.coverImage.large, 32)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                          <Have status={statuses[b.id]} />
                        </div>
                        <div className="min-w-0">
                          <div className={clsx("line-clamp-2 text-xs leading-snug group-hover:underline", b.id === currentId && "text-accent")}>{aniTitle(b.title)}</div>
                          <div className="truncate text-[11px] text-muted">{[RELATION[relation], b.format && FORMAT_LABEL[b.format]].filter(Boolean).join(" · ")}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
