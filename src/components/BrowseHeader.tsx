import { Tabs } from "./PillTabs";

const KINDS = [
  { key: "anime", label: "Anime", href: "/discover/anime" },
  { key: "movies", label: "Movies", href: "/discover/movies" },
  { key: "tv", label: "Series", href: "/discover/tv" },
  { key: "manga", label: "Manga", href: "/discover/manga" },
];

/** Browse's heading: one top-bar tab for anime, movies, series and manga, switched here. Same look as the Library switcher. */
export function BrowseHeader({ active }: { active: "anime" | "movies" | "tv" | "manga" }) {
  return (
    <Tabs tabs={KINDS} active={active} className="scroll-row -mx-1 -mt-1.5 mb-4 flex items-center gap-2 overflow-x-auto px-1 pb-1 pt-1.5">
      <h1 className="mr-2 shrink-0 text-2xl font-bold">Browse</h1>
    </Tabs>
  );
}
