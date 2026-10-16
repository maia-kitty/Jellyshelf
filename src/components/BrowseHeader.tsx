import Link from "next/link";
import clsx from "clsx";

const KINDS = [
  { key: "anime", label: "Anime", href: "/discover/anime" },
  { key: "movies", label: "Movies", href: "/discover/movies" },
  { key: "tv", label: "Series", href: "/discover/tv" },
] as const;

/** Browse's heading: one top-bar tab for anime, movies and series, switched here. */
export function BrowseHeader({ active }: { active: (typeof KINDS)[number]["key"] }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-2xl font-bold">Browse</h1>
      <div className="flex rounded-full border border-line bg-panel p-0.5">
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={k.href}
            className={clsx("rounded-full px-3.5 py-1 text-sm transition", k.key === active ? "bg-panel-2 text-fg" : "text-muted hover:text-fg")}
          >
            {k.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
