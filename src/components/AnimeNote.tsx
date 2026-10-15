/** On a TMDB page for something that's anime: it also lives on AniList, and requesting there keeps your list in sync. */
export function AnimeNote({ href, what }: { href: string; what: "film" | "series" }) {
  return (
    <a href={href} className="mb-4 inline-block rounded-lg border border-anilist/40 bg-anilist/10 px-3 py-1.5 text-sm transition hover:border-anilist">
      <span className="whitespace-nowrap font-semibold text-anilist">Anime {what}</span>
      <span className="text-fg/70">
        {what === "film" ? " · request it from AniList to keep your list in sync →" : " · request each season from its AniList entry to keep your list in sync ↓"}
      </span>
    </a>
  );
}
