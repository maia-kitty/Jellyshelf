import Link from "next/link";
import clsx from "clsx";

const KINDS = [
  { key: "anime", label: "Anime", href: "/discover/anime" },
  { key: "movies", label: "Movies", href: "/discover/movies" },
  { key: "tv", label: "Series", href: "/discover/tv" },
] as const;

/** Browse's heading: one top-bar tab for anime, movies and series, switched here. Same look as the Library switcher. */
export function BrowseHeader({ active }: { active: (typeof KINDS)[number]["key"] }) {
  return (
    <nav className="scroll-row -mx-1 mb-4 flex items-center gap-2 overflow-x-auto px-1 pb-1">
      <h1 className="mr-2 shrink-0 text-2xl font-bold">Browse</h1>
      {KINDS.map((k) => (
        <Link
          key={k.key}
          href={k.href}
          aria-current={k.key === active ? "page" : undefined}
          className={clsx(
            "shrink-0 rounded-full border px-4 py-1.5 text-sm transition active:scale-95",
            k.key === active ? "border-accent bg-accent/15 text-fg" : "border-line text-muted hover:border-muted hover:text-fg",
          )}
        >
          {k.label}
        </Link>
      ))}
    </nav>
  );
}
