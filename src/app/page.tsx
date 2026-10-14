import { CardRow } from "@/components/MediaCard";
import { anilist, currentSeason, shiftSeason } from "@/lib/clients/anilist";
import { tmdbClient } from "@/lib/clients/tmdb";
import { animeCard, decorate, movieCard, soft, tvCard } from "@/lib/cards";
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

  const [rWatching, rPlanning, rSeasonal, rTrending, rUpcoming, rMovies, rTv] = await Promise.all([
    decorate(watching.slice(0, 30), user),
    decorate(planning.slice(0, 30), user),
    decorate(seasonal?.media.map(animeCard) ?? [], user),
    decorate(trendingAnime?.media.map(animeCard) ?? [], user),
    decorate(upcoming?.media.map(animeCard) ?? [], user),
    decorate(movies?.results.map(movieCard) ?? [], user),
    decorate(tv?.results.map(tvCard) ?? [], user),
  ]);

  const season = (s: { season: string; year: number }) => `${s.season[0]}${s.season.slice(1).toLowerCase()} ${s.year}`;
  return (
    <>
      <CardRow title="Continue watching (AniList)" href="/my-lists?status=CURRENT" cards={rWatching} />
      <CardRow title="Your AniList planning" href="/my-lists?status=PLANNING" cards={rPlanning} />
      <CardRow title={`Airing this season · ${season(now)}`} href="/discover/anime?list=seasonal" cards={rSeasonal} />
      <CardRow title="Trending anime" href="/discover/anime" cards={rTrending} />
      <CardRow title={`Next season · ${season(next)}`} href={`/discover/anime?list=seasonal&season=${next.season}&year=${next.year}`} cards={rUpcoming} />
      <CardRow title="Trending movies" href="/discover/movies" cards={rMovies} />
      <CardRow title="Trending series" href="/discover/tv" cards={rTv} />
    </>
  );
}
