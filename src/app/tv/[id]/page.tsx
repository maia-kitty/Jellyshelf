import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AutoHeight } from "@/components/AutoHeight";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { Hero } from "@/components/Hero";
import { CommunityScore } from "@/components/Score";
import { CardRow } from "@/components/MediaCard";
import { TvRequest, TvRequestAll, type SeasonOption } from "@/components/RequestButtons";
import { EpisodeList, JellyfinButton } from "@/components/Episodes";
import { JarLoader } from "@/components/AppIcon";
import { DetailsPanel } from "@/components/DetailsPanel";
import { LibraryStatus } from "@/components/LibraryStatus";
import { looksLikeAnime, tmdbClient, tmdbImage, type TmdbTvDetails } from "@/lib/clients/tmdb";
import { HttpError } from "@/lib/clients/http";
import { decorate, tvCard } from "@/lib/cards";
import { anilistIdsFor } from "@/lib/mapping";
import { findMedia, requestedSeasons } from "@/lib/media";
import { pageUser } from "@/lib/page";
import { resumeHint } from "@/lib/playback";
import { seriesEpisodes, type EpisodesInfo } from "@/lib/episodes";
import { canFixSubs } from "@/lib/subtitles";
import { langName } from "@/lib/langs";

const longDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function TvPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const id = Number((await params).id);
  const [tv, media] = await Promise.all([
    tmdbClient.tv(id).catch((e) => {
      if (e instanceof HttpError && e.status === 404) notFound();
      throw e;
    }),
    findMedia({ kind: "tv", tmdbId: id }),
  ]);
  // Anime has one page, its AniList entry (one per season): go to the first season's.
  if (looksLikeAnime(tv)) {
    const seasons = (await anilistIdsFor({ tmdbTvId: id, tvdbId: tv.external_ids?.tvdb_id })).filter((m) => m.tvdbSeason !== null && m.tvdbSeason !== 0 && m.type !== "MOVIE");
    const order = (m: (typeof seasons)[number]) => (m.tvdbSeason === -1 ? 0 : m.tvdbSeason!) * 100000 + m.episodeOffset;
    const first = seasons.sort((a, b) => order(a) - order(b))[0];
    if (first) redirect(`/anime/${first.anilistId}`);
  }
  const requested = media ? await requestedSeasons(media.id) : { whole: new Set<number>(), some: new Set<number>() };
  const active = media
    ? await db
        .select()
        .from(schema.requests)
        .where(and(eq(schema.requests.mediaId, media.id), inArray(schema.requests.status, ["pending", "approved", "completed"])))
    : [];
  const tvdbId = tv.external_ids?.tvdb_id ?? null;
  // Started once; the hero (Play) and the episode list both wait on it.
  const library = tvdbId
    ? seriesEpisodes({ tvdbId, tmdbId: id, jellyfinItemId: media?.jellyfinItemId ?? null, target: null }).catch(() => null)
    : Promise.resolve(null);

  const recs = await decorate((tv.recommendations?.results ?? []).slice(0, 20).map(tvCard), user);

  const seasons: SeasonOption[] = tv.seasons
    .filter((s) => s.episode_count > 0)
    .map((s) => ({
      number: s.season_number,
      name: s.name,
      episodes: s.episode_count,
      year: s.air_date?.slice(0, 4) ?? null,
      poster: tmdbImage(s.poster_path ?? tv.poster_path),
      status: media?.seasonStatus?.[s.season_number],
      requested: requested.whole.has(s.season_number),
      someEpisodes: requested.some.has(s.season_number),
    }));
  const regular = seasons.filter((s) => s.number > 0).length;

  return (
    <>
      <Hero
        title={tv.name}
        original={tv.original_name}
        poster={tmdbImage(tv.poster_path, "w500")}
        backdrop={tmdbImage(tv.backdrop_path, "original")}
        facts={[
          tv.first_air_date?.slice(0, 4),
          `${regular} season${regular === 1 ? "" : "s"}`,
          tv.number_of_episodes ? `${tv.number_of_episodes} episodes` : null,
          tv.vote_average ? <CommunityScore score={Math.round(tv.vote_average * 10)} percent /> : null,
        ]}
        genres={tv.genres.map((g) => g.name)}
        overview={tv.overview}
        status={media?.status}
        aside={<TvDetails tv={tv} />}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            <Suspense fallback={null}>
              <PlayButton library={library} user={user} />
            </Suspense>
            {tvdbId ? (
              <TvRequestAll tmdbId={id} seasons={seasons} />
            ) : (
              <p className="text-sm text-bad">No TVDB id on TMDB — Sonarr can&apos;t add this show.</p>
            )}
          </div>
          <LibraryStatus requests={active} media={media} inLibrary={media?.status === "available"} />
        </div>
      </Hero>

      {tvdbId && (
        <AutoHeight>
          <Suspense fallback={<div className="card mb-10 p-6"><JarLoader width={200} label="Loading episodes…" /></div>}>
            <TvEpisodes library={library} title={tv.name} user={user} />
          </Suspense>
        </AutoHeight>
      )}
      {tvdbId && <TvRequest tmdbId={id} seasons={seasons} />}
      <CardRow title="More like this" cards={recs} />
    </>
  );
}

async function PlayButton({ library, user }: { library: Promise<EpisodesInfo | null>; user: User }) {
  const href = (await library)?.playUrl ?? null;
  return <JellyfinButton href={href} resume={await resumeHint(user, href)} />;
}

async function TvEpisodes({ library, title, user }: { library: Promise<EpisodesInfo | null>; title: string; user: User }) {
  const info = await library;
  if (!info || (!info.episodes.length && !info.playUrl)) return null;
  const canFix = info.subs ? await canFixSubs(user, info.subs) : false;
  return <EpisodeList info={info} anilist={null} groupBySeason title={title} canFixSubs={canFix} />;
}

function TvDetails({ tv }: { tv: TmdbTvDetails }) {
  const imdb = tv.external_ids?.imdb_id;
  const runtime = tv.episode_run_time?.[0];
  const ended = tv.status === "Ended" || tv.status === "Canceled";
  return (
    <DetailsPanel
      facts={[
        ["First aired", tv.first_air_date ? longDate(tv.first_air_date) : null],
        [ended ? "Last aired" : "Latest episode", tv.last_air_date ? longDate(tv.last_air_date) : null],
        ["Status", tv.status],
        ["Network", tv.networks?.slice(0, 2).map((n) => n.name).join(", ")],
        ["Episode length", runtime ? `${runtime} min` : null],
        ["Language", tv.original_language ? langName(tv.original_language) : null],
        ["Created by", tv.created_by?.slice(0, 2).map((c) => c.name).join(", ")],
      ]}
      links={[
        { label: "TMDB", href: `https://www.themoviedb.org/tv/${tv.id}` },
        ...(imdb ? [{ label: "IMDb", href: `https://www.imdb.com/title/${imdb}` }] : []),
        ...(tv.external_ids?.tvdb_id ? [{ label: "TVDB", href: `https://thetvdb.com/dereferrer/series/${tv.external_ids.tvdb_id}` }] : []),
      ]}
    />
  );
}
