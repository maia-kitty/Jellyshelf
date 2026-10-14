import { aniDescription } from "@/lib/text";
import { CardRow } from "@/components/MediaCard";
import { Spotlight, type SpotlightItem } from "@/components/Spotlight";
import { anilist, currentSeason, seasonLabel, shiftSeason } from "@/lib/clients/anilist";
import { tmdbClient, tmdbImage } from "@/lib/clients/tmdb";
import { animeCard, decorateGroups, movieCard, soft, tvCard, type Card } from "@/lib/cards";
import { anilistToken } from "@/lib/auth";
import { pageUser } from "@/lib/page";

export default async function Home() {
  const user = await pageUser();
  const now = currentSeason();
  const next = shiftSeason(now, 1);
  const token = anilistToken(user);

  const [spotlight, seasonal, trendingAnime, upcoming, movies, tv, list] = await Promise.all([
    soft(anilist.spotlight(), [], "spotlight"),
    soft(anilist.seasonal(now.season, now.year, { perPage: 20 }), null, "seasonal"),
    soft(anilist.trending({ perPage: 20 }), null, "anime trending"),
    soft(anilist.seasonal(next.season, next.year, { perPage: 20 }), null, "next season"),
    soft(tmdbClient.trendingMovies(), null, "movies"),
    soft(tmdbClient.trendingTv(), null, "tv"),
    token && user.anilistId ? soft(anilist.userList(user.anilistId, token), null, "user list") : null,
  ]);

  const watching = list ? [...list.values()].filter((e) => e.status === "CURRENT").map((e) => animeCard(e.media)) : [];
  const planning = list ? [...list.values()].filter((e) => e.status === "PLANNING").map((e) => animeCard(e.media)) : [];

  const [rSpotlight, rWatching, rPlanning, rSeasonal, rTrending, rUpcoming, rMovies, rTv] = await decorateGroups(
    [
      spotlight.map(animeCard),
      watching.slice(0, 30),
      planning.slice(0, 30),
      seasonal?.media.map(animeCard) ?? [],
      trendingAnime?.media.map(animeCard) ?? [],
      upcoming?.media.map(animeCard) ?? [],
      movies?.results.map(movieCard) ?? [],
      tv?.results.map(tvCard) ?? [],
    ],
    user,
  );

  // Spotlight: trending anime interleaved with trending movies and series that have backdrop art.
  const anime: SpotlightItem[] = rSpotlight.map((card, n) => ({
    card,
    banner: spotlight[n].bannerImage!,
    description: aniDescription(spotlight[n].description, { oneParagraph: true }),
    label: "Trending anime",
  }));
  const tmdbItems = <T extends { backdrop_path: string | null; overview: string }>(src: T[] | undefined, cards: Card[], label: string) =>
    (src ?? [])
      .map((m, n) => ({ m, card: cards[n] }))
      .filter(({ m, card }) => m.backdrop_path && !card.isAnime)
      .slice(0, 3)
      .map(({ m, card }) => ({ card, banner: tmdbImage(m.backdrop_path, "w1280")!, description: m.overview, label }));
  const film = tmdbItems(movies?.results, rMovies, "Trending movie");
  const series = tmdbItems(tv?.results, rTv, "Trending series");
  const spotlightItems = Array.from({ length: Math.max(anime.length, film.length, series.length) })
    .flatMap((_, n) => [anime[n], film[n], series[n]])
    .filter(Boolean)
    .slice(0, 9);

  return (
    <>
      <Spotlight items={spotlightItems} />
      <CardRow title="Continue watching (AniList)" href="/my-lists?status=CURRENT" cards={rWatching} />
      <CardRow title="Your AniList planning" href="/my-lists?status=PLANNING" cards={rPlanning} />
      <CardRow title={`Airing this season · ${seasonLabel(now)}`} href="/discover/anime?list=seasonal" cards={rSeasonal} />
      <CardRow title="Trending anime" href="/discover/anime" cards={rTrending} />
      <CardRow title={`Next season · ${seasonLabel(next)}`} href={`/discover/anime?list=seasonal&season=${next.season}&year=${next.year}`} cards={rUpcoming} />
      <CardRow title="Trending movies" href="/discover/movies" cards={rMovies} />
      <CardRow title="Trending series" href="/discover/tv" cards={rTv} />
    </>
  );
}
