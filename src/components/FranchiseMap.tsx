"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
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
  OTHER: "Related",
};

const CARD_W = 196;
const CARD_H = 64;
const GAP_X = 56;
const GAP_Y = 44;
const PAD = 20;
/** How round the arrows' corners are. */
const R = 12;
const STORY = "var(--color-ok)";
const OFFSHOOT = "var(--color-anilist)";

/** `along` is the story entry it's at, `across` 0 for the story itself and 1, 2… for what branches off it. */
type Node = { entry: AniMediaCard; along: number; across: number; relation?: AniRelationType };
type Edge = { from: Node; to: Node; story: boolean };

/**
 * The story runs along one line; what branches off an entry sits next to the following story entry, beside the
 * line. So no arrow crosses another card.
 */
function layout(map: FranchiseMapEntry[]) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  map.forEach(({ entry, branches }, k) => {
    const node = { entry, along: k, across: 0 };
    if (k) edges.push({ from: nodes.findLast((n) => n.across === 0)!, to: node, story: true });
    nodes.push(node);
    // Just the one entry and one branch: the branch goes on the line too, rather than off to one side.
    const inline = map.length === 1 && branches.length === 1;
    branches.forEach((b, j) => {
      const twig = { entry: b.entry, along: k + 1, across: inline ? 0 : j + 1, relation: b.relation };
      nodes.push(twig);
      edges.push({ from: node, to: twig, story: false });
    });
  });
  return { nodes, edges };
}

/**
 * One drawing of the map: the story down the left (phones), or along the top (wide screens). Branch arrows run, with
 * rounded corners, through the gap between the rows (or columns) of cards, so they never run across one.
 */
function Graph({ nodes, edges, currentId, statuses, sideways }: ReturnType<typeof layout> & { currentId: number; statuses: Record<number, MediaStatus>; sideways: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const cell = (n: Pick<Node, "along" | "across">) => (sideways ? { col: n.along, row: n.across } : { col: n.across, row: n.along });
  const at = (n: Pick<Node, "along" | "across">) => {
    const { col, row } = cell(n);
    return { x: PAD + col * (CARD_W + GAP_X) + CARD_W / 2, y: PAD + row * (CARD_H + GAP_Y) + CARD_H / 2 };
  };
  const cols = Math.max(...nodes.map((n) => cell(n).col)) + 1;
  const rows = Math.max(...nodes.map((n) => cell(n).row)) + 1;
  const [W, H] = [PAD * 2 + cols * CARD_W + (cols - 1) * GAP_X, PAD * 2 + rows * CARD_H + (rows - 1) * GAP_Y];

  const arrow = ({ from, to, story }: Edge) => {
    const a = at(from);
    const b = at(to);
    if (sideways) {
      const [x1, x2] = [a.x + CARD_W / 2 + 2, b.x - CARD_W / 2 - 5];
      if (story || from.across === to.across) return `M${x1} ${a.y} H${x2}`;
      // Out to a trunk halfway across the gap, down it, and in to the card; every branch of an entry shares the trunk.
      const [y1, mid] = [a.y + CARD_H / 4, (x1 + x2) / 2];
      return `M${x1} ${y1} H${mid - R} Q${mid} ${y1} ${mid} ${y1 + R} V${b.y - R} Q${mid} ${b.y} ${mid + R} ${b.y} H${x2}`;
    }
    const [y1, y2] = [a.y + CARD_H / 2 + 2, b.y - CARD_H / 2 - 5];
    if (story || from.across === to.across) return `M${a.x} ${y1} V${y2}`;
    // Down to a trunk halfway across the gap, along it, and down onto the card.
    const [x1, mid] = [a.x + CARD_W / 4, (y1 + y2) / 2];
    return `M${x1} ${y1} V${mid - R} Q${x1} ${mid} ${x1 + R} ${mid} H${b.x - R} Q${b.x} ${mid} ${b.x} ${mid + R} V${y2}`;
  };

  const here = nodes.find((n) => n.entry.id === currentId);
  const [along, across] = here ? [here.along, here.across] : [0, 0];
  useEffect(() => {
    const s = scroller.current;
    // The other drawing is hidden at this screen size: nothing to scroll.
    if (!s?.clientWidth) return;
    const c = at({ along, across });
    s.scrollTo({ left: c.x - s.clientWidth / 2, top: c.y - s.clientHeight / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [along, across]);

  const id = sideways ? "fm-h" : "fm-v";
  return (
    <div ref={scroller} className={clsx("card max-h-[34rem] overflow-auto overscroll-contain", sideways ? "hidden md:block" : "md:hidden")}>
      <div className="relative mx-auto" style={{ width: W, height: H }}>
        <svg aria-hidden className="absolute inset-0" width={W} height={H}>
          <defs>
            {[STORY, OFFSHOOT].map((c, i) => (
              <marker key={c} id={`${id}-${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 10 5 0 10z" fill={c} />
              </marker>
            ))}
          </defs>
          {edges.map((e) => (
            <path
              key={`${e.from.entry.id}-${e.to.entry.id}`}
              d={arrow(e)}
              fill="none"
              stroke={e.story ? STORY : OFFSHOOT}
              strokeWidth={1.5}
              markerEnd={`url(#${id}-${e.story ? 0 : 1})`}
            />
          ))}
        </svg>
        {nodes.map((n) => {
          const current = n.entry.id === currentId;
          const status = statuses[n.entry.id];
          return (
            <Link
              key={n.entry.id}
              href={`/anime/${n.entry.id}`}
              aria-current={current ? "page" : undefined}
              className={clsx(
                "group absolute flex items-center gap-2.5 overflow-hidden rounded-lg border bg-panel-2 p-1.5 pr-2.5 transition hover:border-muted",
                current ? "border-accent ring-1 ring-accent" : "border-line",
              )}
              style={{ left: at(n).x - CARD_W / 2, top: at(n).y - CARD_H / 2, width: CARD_W, height: CARD_H }}
            >
              <span className="relative h-full w-11 shrink-0 overflow-hidden rounded bg-panel">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img {...sized(n.entry.coverImage.large, 44)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                {(status === "available" || status === "partially_available") && (
                  <span
                    title={status === "available" ? "In your library" : "Partly in your library"}
                    className={clsx("absolute right-0.5 top-0.5 h-2 w-2 rounded-full ring-2 ring-panel-2", status === "available" ? "bg-ok" : "bg-ok/50")}
                  />
                )}
              </span>
              <span className="min-w-0">
                <span className={clsx("line-clamp-2 text-xs leading-snug group-hover:underline", current && "text-accent")}>{aniTitle(n.entry.title)}</span>
                <span className="block truncate text-[11px] text-muted">
                  {[n.relation && RELATION[n.relation], n.entry.format && FORMAT_LABEL[n.entry.format], n.entry.seasonYear].filter(Boolean).join(" · ")}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * How a franchise fits together, as a map of linked cards: green arrows carry the story on (sequels, films that
 * continue it), blue ones lead to what branches off it (side stories, spin-offs, recaps). It opens on this page's entry.
 */
export function FranchiseMap({ map, currentId, statuses }: { map: FranchiseMapEntry[]; currentId: number; statuses: Record<number, MediaStatus> }) {
  const graph = layout(map);
  if (graph.nodes.length < 2) return null;
  return (
    <section className="mb-10">
      <ShelfHeader
        title="Franchise map"
        note={`${graph.nodes.length} entries`}
        actions={
          <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: STORY }} />
              Sequel
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: OFFSHOOT }} />
              Side story & more
            </span>
          </span>
        }
      />
      <Graph {...graph} currentId={currentId} statuses={statuses} sideways={false} />
      <Graph {...graph} currentId={currentId} statuses={statuses} sideways />
    </section>
  );
}
