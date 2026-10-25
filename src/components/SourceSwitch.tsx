import { Tabs } from "./PillTabs";

/** Flips between a title's two pages, its AniList entry and its TMDB page, when it has both. */
export function SourceSwitch({ active, anilist, tmdb }: { active: "anilist" | "tmdb"; anilist: string | null; tmdb: string | null }) {
  if (!anilist || !tmdb) return null;
  return (
    <Tabs
      small
      className="mb-4 flex gap-1.5"
      tabs={[
        { key: "anilist", label: "AniList", href: anilist },
        { key: "tmdb", label: "TMDB", href: tmdb },
      ]}
      active={active}
    />
  );
}
