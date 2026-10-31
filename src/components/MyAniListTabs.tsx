import { Tabs } from "./Tabs";
import type { AniListEntry, AniListStatus } from "@/lib/clients/anilist";

export const LIST_TABS: { key: AniListStatus; label: string }[] = [
  { key: "CURRENT", label: "Watching" },
  { key: "PLANNING", label: "Planning" },
  { key: "PAUSED", label: "Paused" },
  { key: "REPEATING", label: "Rewatching" },
  { key: "COMPLETED", label: "Completed" },
  { key: "DROPPED", label: "Dropped" },
];

/** The same statuses in AniList's manga words. */
export const MANGA_TABS: { key: AniListStatus; label: string }[] = [
  { key: "CURRENT", label: "Reading" },
  { key: "PLANNING", label: "Planning" },
  { key: "PAUSED", label: "Paused" },
  { key: "REPEATING", label: "Rereading" },
  { key: "COMPLETED", label: "Completed" },
  { key: "DROPPED", label: "Dropped" },
];

/**
 * My AniList's heading: Anime / Manga / Ratings to switch between (same look as Browse's switcher), and under it the
 * statuses of the list that's open. Without AniList linked there are no lists, only the connect prompt and Ratings.
 */
export function MyAniListTabs({
  kind,
  status,
  list,
  linked = true,
  href,
}: {
  kind: "anime" | "manga" | "ratings";
  /** The open status (lists only). */
  status?: AniListStatus;
  /** The open list's entries, for the counts. */
  list?: Map<number, Pick<AniListEntry, "status">> | null;
  linked?: boolean;
  href?: (status: AniListStatus) => string;
}) {
  const count = (s: AniListStatus) => (list ? ` · ${[...list.values()].filter((e) => e.status === s).length}` : "");
  const statuses = kind === "manga" ? MANGA_TABS : LIST_TABS;
  return (
    <>
      <Tabs
        active={kind}
        className="scroll-row -mx-1 -mt-1.5 mb-4 flex items-center gap-2 overflow-x-auto px-1 pb-1 pt-1.5"
        tabs={[
          { key: "anime", label: "Anime", href: "/my-lists" },
          ...(linked ? [{ key: "manga", label: "Manga", href: "/my-lists/manga" }] : []),
          { key: "ratings", label: "Ratings", href: "/ratings" },
        ]}
      >
        <h1 className="mr-2 shrink-0 text-2xl font-bold">My AniList</h1>
      </Tabs>
      {kind !== "ratings" && linked && status && href && (
        <Tabs active={status} tabs={statuses.map((s) => ({ key: s.key, label: s.label + count(s.key), href: href(s.key) }))} />
      )}
    </>
  );
}
