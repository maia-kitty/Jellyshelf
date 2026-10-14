import { CardRow } from "@/components/MediaCard";
import { anilist, currentSeason, seasonLabel, shiftSeason } from "@/lib/clients/anilist";
import { tmdbClient } from "@/lib/clients/tmdb";
import { animeCard, decorateGroups, movieCard, soft, tvCard } from "@/lib/cards";
import { anilistToken } from "@/lib/auth";
import { pageUser } from "@/lib/page";

export default async function Home() {
  const user = await pageUser();
  const now = currentSeason();
  const next = shiftSeason(now, 1);
  const token = anilistToken(user);

  const [seasonal, trendingAnime, upcoming, movies, tv, list] = await Promise.all([
    soft(anilist.seasonal(now.season, now.year, { perPage: 20 }), null, "seasonal"),
    soft(anilist.trending({ perPage: 20 }), null, "anime trending"),
    soft(anilist.seasonal(next.season, next.year, { perPage: 20 }), null, "next season"),
    soft(tmdbClient.trendingMovies(), null, "movies"),
    soft(tmdbClient.trendingTv(), null, "tv"),
    token && user.anilistId ? soft(anilist.userList(user.anilistId, token), null, "user list") : null,
  ]);

  const watching = list ? [...list.values()].filter((e) => e.status === "CURRENT").map((e) => animeCard(e.media)) : [];
  const planning = list ? [...list.values()].filter((e) => e.status === "PLANNING").map((e) => animeCard(e.media)) : [];

  const [rWatching, rPlanning, rSeasonal, rTrending, rUpcoming, rMovies, rTv] = await decorateGroups(
    [
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

  return (
    <>
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
