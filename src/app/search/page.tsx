import { CardGrid } from "@/components/MediaCard";
import { Tabs } from "@/components/Tabs";
import { anilist } from "@/lib/clients/anilist";
import { tmdbClient } from "@/lib/clients/tmdb";
import { animeCard, decorate, movieCard, soft, tvCard, type Card } from "@/lib/cards";
import { pageUser, param, type SearchParams } from "@/lib/page";

export default async function Search({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser();
  const sp = await searchParams;
  const q = (param(sp, "q") ?? "").trim();
  const tab = param(sp, "tab") ?? "anime";
  if (!q) return <p className="text-muted">Type something in the search box.</p>;

  const [ani, tmdb] = await Promise.all([
    soft(anilist.search(q, { perPage: 42 }), null, "anilist search"),
    soft(tmdbClient.search(q), null, "tmdb search"),
  ]);
  const animeCards = ani?.media.map(animeCard) ?? [];
  const tmdbCards: Card[] = (tmdb?.results ?? []).flatMap((r) =>
    r.media_type === "movie" ? [movieCard(r)] : r.media_type === "tv" ? [tvCard(r)] : [],
  );
  const cards = await decorate(tab === "anime" ? animeCards : tmdbCards, user);
  const enc = encodeURIComponent(q);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Results for “{q}”</h1>
      <Tabs
        active={tab}
        tabs={[
          { key: "anime", label: `Anime (AniList) · ${animeCards.length}`, href: `/search?q=${enc}&tab=anime` },
          { key: "tmdb", label: `Movies & Series · ${tmdbCards.length}`, href: `/search?q=${enc}&tab=tmdb` },
        ]}
      />
      {tab === "tmdb" && tmdbCards.some((c) => c.isAnime) && (
        <p className="mb-4 text-sm text-muted">
          Results tagged <span className="text-anilist">ANIME</span> are better requested from the Anime tab, which maps each season
          correctly.
        </p>
      )}
      <CardGrid cards={cards} />
    </>
  );
}
