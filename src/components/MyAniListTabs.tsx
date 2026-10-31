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

/** The heading and tab row shared by My AniList's lists and your Ratings, which live under the one top-bar tab. */
export function MyAniListTabs({
  active,
  list,
  linked = true,
  href = (s) => `/my-lists?status=${s}`,
}: {
  active: AniListStatus | "manga" | "ratings" | "connect";
  /** Without AniList there are no lists to tab between: just the connect prompt, and your own ratings. */
  linked?: boolean;
  /** Your AniList entries, for the counts (null when AniList isn't linked). */
  list: Map<number, Pick<AniListEntry, "status">> | null;
  href?: (status: AniListStatus) => string;
}) {
  const count = (s: AniListStatus) => (list ? ` · ${[...list.values()].filter((e) => e.status === s).length}` : "");
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">My AniList</h1>
      <Tabs
        active={active}
        tabs={[
          ...(linked
            ? LIST_TABS.map((s) => ({ key: s.key, label: s.label + count(s.key), href: href(s.key) }))
            : [{ key: "connect", label: "Lists", href: "/my-lists" }]),
          ...(linked ? [{ key: "manga", label: "Manga", href: "/my-lists/manga" }] : []),
          { key: "ratings", label: "Ratings", href: "/ratings" },
        ]}
      />
    </>
  );
}
