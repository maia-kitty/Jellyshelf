import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Media, User } from "@/db/schema";
import { aniDescription } from "@/lib/text";
import { CardRow } from "@/components/MediaCard";
import { Spotlight, type SpotlightItem } from "@/components/Spotlight";
import { ContinueRow } from "@/components/discover/ContinueRow";
import { OnItsWay, type InFlight } from "@/components/discover/OnItsWay";
import { WeekSchedule, type ScheduleSlot } from "@/components/discover/WeekSchedule";
import { TopTen } from "@/components/discover/TopTen";
import { anilist, aniTitle, currentSeason, seasonLabel, shiftSeason, type AniListEntry, type AniMediaCard } from "@/lib/clients/anilist";
import { tmdbClient, tmdbImage } from "@/lib/clients/tmdb";
import { animeCard, decorateGroups, movieCard, soft, tvCard, type Card } from "@/lib/cards";
import { statusMap } from "@/lib/media";
import { anilistToken } from "@/lib/auth";
import { pageUser } from "@/lib/page";
import { continueWatching } from "@/lib/continueWatching";
import { downloadQueues, progressFor } from "@/lib/downloads";
import { requestScope } from "@/lib/requestScope";

const DAY = 86_400;

export default async function Home() {
  const user = await pageUser();
  const now = currentSeason();
  const next = shiftSeason(now, 1);
  const token = anilistToken(user);
  const t = Math.floor(Date.now() / 1000);
  // From the start of today (UTC-12, so "today" covers every timezone) for a week.
  const weekFrom = t - (t % DAY) - DAY / 2;

  const [spotlight, seasonal, trendingAnime, upcoming, movies, tv, list, schedule, mine, loved] = await Promise.all([
    soft(anilist.spotlight(), [], "spotlight"),
    soft(anilist.seasonal(now.season, now.year, { perPage: 30 }), null, "seasonal"),
    soft(anilist.trending({ perPage: 20 }), null, "anime trending"),
    soft(anilist.seasonal(next.season, next.year, { perPage: 20 }), null, "next season"),
    soft(tmdbClient.trendingMovies(), null, "movies"),
    soft(tmdbClient.trendingTv(), null, "tv"),
    token && user.anilistId ? soft(anilist.userList(user.anilistId, token), null, "user list") : null,
    soft(anilist.schedule(weekFrom, weekFrom + 8 * DAY), [], "schedule"),
    myRequests(user),
    favourite(user),
  ]);

  const watching = await continueWatching(user, list);
  const planning = list ? [...list.values()].filter((e) => e.status === "PLANNING").map((e) => animeCard(e.media)) : [];
  // Top 10 of the season by score, among the ones people are actually watching.
  const top = (seasonal?.media ?? []).filter((m) => m.averageScore).sort((a, b) => b.averageScore! - a.averageScore!).slice(0, 10);
  const recs = loved ? await soft(anilist.recommendations(loved.anilistId), [], "recommendations") : [];
  const fresh = recs.filter((m) => !list?.has(m.id) && m.id !== loved?.anilistId).slice(0, 18);

  const [rSpotlight, rWatching, rPlanning, rTop, rTrending, rUpcoming, rMovies, rTv, rRecs, rLanded] = await decorateGroups(
    [
      spotlight.map(animeCard),
      watching.slice(0, 30),
      planning.slice(0, 30),
      top.map(animeCard),
      trendingAnime?.media.map(animeCard) ?? [],
      upcoming?.media.map(animeCard) ?? [],
      movies?.results.map(movieCard) ?? [],
      tv?.results.map(tvCard) ?? [],
      fresh.map(animeCard),
      mine.landed,
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
      <ContinueRow cards={rWatching} />
      <OnItsWay items={mine.inFlight} />
      <WeekSchedule slots={await scheduleSlots(schedule, list)} hasList={!!list} />
      <CardRow title="Just landed" note="your requests, now in the library" href="/requests?filter=completed" cards={rLanded} />
      <TopTen title={`Top 10 · ${seasonLabel(now)}`} note="best rated this season" href="/discover/anime?list=seasonal" cards={rTop} />
      {loved && (
        <CardRow
          title={
            <>
              Because you loved <span className="text-anilist">{loved.title}</span>
            </>
          }
          note={loved.total ? `you rated it ${loved.total}` : undefined}
          cards={rRecs}
        />
      )}
      <CardRow title="Your AniList planning" href="/my-lists?status=PLANNING" cards={rPlanning} />
      <CardRow title="Trending anime" href="/discover/anime" cards={rTrending} />
      <CardRow title={`Next season · ${seasonLabel(next)}`} href={`/discover/anime?list=seasonal&season=${next.season}&year=${next.year}`} cards={rUpcoming} />
      <CardRow title="Trending movies" href="/discover/movies" cards={rMovies} />
      <CardRow title="Trending series" href="/discover/tv" cards={rTv} />
    </>
  );
}

/** The viewer's requests: what's still on its way (with download progress), and what arrived in the last three weeks. */
async function myRequests(user: User): Promise<{ inFlight: InFlight[]; landed: Card[] }> {
  const rows = await db
    .select({ request: schema.requests, media: schema.media })
    .from(schema.requests)
    .innerJoin(schema.media, eq(schema.media.id, schema.requests.mediaId))
    .where(
      and(
        eq(schema.requests.userId, user.id),
        inArray(schema.requests.status, ["pending", "approved", "completed"]),
        gte(schema.requests.updatedAt, new Date(Date.now() - 60 * DAY * 1000)),
      ),
    )
    .orderBy(desc(schema.requests.updatedAt))
    .limit(60);

  const waiting = rows.filter((r) => r.request.status === "pending" || (r.request.status === "approved" && r.media.status !== "available"));
  const queues = waiting.some((r) => r.request.status === "approved") ? await downloadQueues() : null;
  const inFlight: InFlight[] = waiting.slice(0, 9).map(({ request, media }) => {
    const download = queues && request.status === "approved" ? progressFor(request, media, queues) : null;
    return {
      id: request.id,
      title: media.title,
      poster: media.poster,
      href: mediaHref(media),
      scope: requestScope(request),
      state: request.status === "pending" ? "pending" : download ? "downloading" : "searching",
      download,
    };
  });

  const recent = Date.now() - 21 * DAY * 1000;
  const seen = new Set<number>();
  const landed: Card[] = rows
    .filter((r) => (r.request.status === "completed" || r.media.status === "available") && r.request.updatedAt.getTime() > recent)
    .filter((r) => !seen.has(r.media.id) && seen.add(r.media.id))
    .slice(0, 20)
    .map(({ request, media }) => ({
      kind: media.kind,
      id: media.kind === "anime" ? media.anilistId! : media.tmdbId!,
      title: media.title,
      poster: media.poster,
      year: null,
      href: mediaHref(media),
      sub: `Arrived ${ago(request.updatedAt)}`,
      isAnime: media.kind === "anime",
    }));
  return { inFlight, landed };
}

const mediaHref = (m: Media) => (m.kind === "anime" ? `/anime/${m.anilistId}` : `/${m.kind}/${m.tmdbId}`);

function ago(d: Date) {
  const days = Math.floor((Date.now() - d.getTime()) / (DAY * 1000));
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * Something the viewer rated highly, to base recommendations on. It rotates daily among their favourites so the row
 * doesn't go stale: rubric ratings first, then AniList scores.
 */
async function favourite(user: User): Promise<{ anilistId: number; title: string; total: number | null } | null> {
  const rated = await db
    .select({ anilistId: schema.ratings.anilistId, title: schema.ratings.title, total: schema.ratings.total })
    .from(schema.ratings)
    .where(and(eq(schema.ratings.userId, user.id), gte(schema.ratings.total, 80)))
    .orderBy(desc(schema.ratings.total))
    .limit(10);
  const picks = rated.filter((r) => r.anilistId);
  if (!picks.length) return null;
  const pick = picks[Math.floor(Date.now() / (DAY * 1000)) % picks.length];
  return { anilistId: pick.anilistId!, title: pick.title, total: pick.total };
}

async function scheduleSlots(schedule: Awaited<ReturnType<typeof anilist.schedule>>, list: Map<number, AniListEntry & { media: AniMediaCard }> | null): Promise<ScheduleSlot[]> {
  const relevant = schedule.filter((s) => list?.has(s.media.id) || (s.media.popularity >= 3000 && s.media.countryOfOrigin !== "CN"));
  const status = await statusMap(relevant.map((s) => ({ kind: "anime" as const, anilistId: s.media.id })));
  const inLibrary = (id: number) => ["available", "partially_available"].includes(status[`anime:${id}`] ?? "");
  return relevant.map((s) => ({
    at: s.airingAt,
    episode: s.episode,
    id: s.media.id,
    title: aniTitle(s.media.title),
    cover: s.media.coverImage.large,
    popularity: s.media.popularity,
    mine: list?.get(s.media.id)?.status,
    have: inLibrary(s.media.id),
  }));
}
