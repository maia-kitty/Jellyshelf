import { aniDescription } from "@/lib/text";
import { Suspense } from "react";
import { AutoHeight } from "@/components/AutoHeight";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Media, Request, User } from "@/db/schema";
import { Hero } from "@/components/Hero";
import { CommunityScore } from "@/components/Score";
import { FranchiseMap } from "@/components/FranchiseMap";
import { RequestThis, type AnimeEntryOption } from "@/components/RequestButtons";
import { MappingOverride } from "@/components/MappingOverride";
import { AniListPanel } from "@/components/AniListPanel";
import { EpisodeList, JellyfinButton } from "@/components/Episodes";
import { FileCard } from "@/components/FileCard";
import { LibraryStatus } from "@/components/LibraryStatus";
import { JarLoader } from "@/components/AppIcon";
import { movieInfo, seriesEpisodes, type EpisodesInfo, type MovieLibraryInfo } from "@/lib/episodes";
import { findMedia } from "@/lib/media";
import { anilist, aniTitle, FORMAT_LABEL, franchiseMap, seasonLabel, type AniMediaCard } from "@/lib/clients/anilist";
import { anilistToken } from "@/lib/auth";
import { animeCard, decorate } from "@/lib/cards";
import { getMapping, resolveAnime, tmdbPageFor } from "@/lib/mapping";
import { animeMediaMap, statusMap } from "@/lib/media";
import { pageUser } from "@/lib/page";
import { resumeHint } from "@/lib/playback";
import { latestRating } from "@/lib/ratings";
import { canFixSubs } from "@/lib/subtitles";
import { getSettings } from "@/lib/settings";
import { SourceSwitch } from "@/components/SourceSwitch";

/** What the request button needs to know about an entry. */
async function requestOption(e: AniMediaCard): Promise<AnimeEntryOption> {
  const [mediaMap, settings, { target }] = await Promise.all([animeMediaMap([e.id]), getSettings(), resolveAnime(e)]);
  const m = mediaMap.get(e.id);
  return {
    id: e.id,
    mapped: target.service !== "unmapped",
    canDub: target.service !== "unmapped" && !!settings[target.service].animeDubQualityProfileId,
    status: m?.status,
    requested: !!m?.requested,
    episodes: e.episodes,
  };
}

type Library = { kind: "series"; info: EpisodesInfo } | { kind: "movie"; info: MovieLibraryInfo } | null;

/** What Sonarr/Radarr/Jellyfin have of this entry: its episodes, or the film's file. */
async function loadLibrary(entry: AniMediaCard, media: Media | undefined): Promise<Library> {
  const { target } = await resolveAnime(entry);
  if (target.service === "radarr") {
    const info = await movieInfo({ itemId: media?.jellyfinItemId, tmdbId: target.tmdbId, anilistId: entry.id, radarrId: media?.radarrId }).catch(() => null);
    return info && { kind: "movie", info };
  }
  if (target.service !== "sonarr") return null;
  const info = await seriesEpisodes({ tvdbId: target.tvdbId, anilistId: entry.id, jellyfinItemId: media?.jellyfinItemId, target }).catch(() => null);
  return info && (info.episodes.length || info.playUrl) ? { kind: "series", info } : null;
}

/** Play when it's there, Request when it isn't, and how far along a request is. */
async function HeroActions({
  library,
  current,
  requests,
  media,
  progress,
  user,
}: {
  library: Promise<Library>;
  current: AnimeEntryOption;
  requests: Request[];
  media: Media | undefined;
  progress: number | null;
  user: User;
}) {
  const lib = await library;
  // A series entry starts at the episode after your AniList progress (or its first), not wherever the series left off.
  const nextEp = lib?.kind === "series" ? (lib.info.episodes.find((e) => e.playUrl && e.n === (progress ?? 0) + 1) ?? lib.info.episodes.find((e) => e.playUrl)) : undefined;
  const playUrl = nextEp?.playUrl ?? lib?.info.playUrl ?? null;
  const label = nextEp && (progress ?? 0) > 0 ? `Play episode ${nextEp.n}` : "Play";
  const eps = lib?.kind === "series" ? lib.info.episodes : [];
  // Still airing: AniList doesn't know the count yet, Sonarr knows the episodes announced so far.
  const episodes = current.episodes ?? (eps.length ? Math.max(...eps.map((e) => e.n)) : null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <JellyfinButton href={playUrl} label={label} resume={await resumeHint(user, playUrl, nextEp && `episode ${nextEp.n}`)} />
        {current.status !== "available" && !(playUrl && current.requested) && <RequestThis entry={{ ...current, episodes }} have={eps.filter((e) => e.hasFile).map((e) => e.n)} />}
      </div>
      <LibraryStatus requests={requests} media={media} inLibrary={!!playUrl || current.status === "available"} />
    </div>
  );
}

async function LibrarySection({ library, entry, progress, user }: { library: Promise<Library>; entry: AniMediaCard; progress: number | null; user: User }) {
  const lib = await library;
  if (!lib) return null;
  const title = aniTitle(entry.title);
  if (lib.kind === "movie") {
    if (!lib.info.file) return null;
    return (
      <div className="mb-10">
        <FileCard info={lib.info} title={title} user={user} />
      </div>
    );
  }
  const canFix = lib.info.subs ? await canFixSubs(user, lib.info.subs) : false;
  return <EpisodeList info={lib.info} anilist={progress !== null ? { mediaId: entry.id, progress } : null} title={title} canFixSubs={canFix} />;
}

async function MapSection({ id }: { id: number }) {
  const map = await franchiseMap(id).catch(() => []);
  const ids = map.flatMap((m) => [m.entry.id, ...m.branches.map((b) => b.entry.id)]);
  const status = await statusMap(ids.map((anilistId) => ({ kind: "anime" as const, anilistId })));
  return <FranchiseMap map={map} currentId={id} statuses={Object.fromEntries(ids.map((i) => [i, status[`anime:${i}`]]))} />;
}

export default async function AnimePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const id = Number((await params).id);
  const token = anilistToken(user);
  // The entry, your list and our records don't depend on each other: ask for them together.
  const [a, list, media, rating, mapping] = await Promise.all([
    anilist.media(id),
    token && user.anilistId ? anilist.userList(user.anilistId, token).catch(() => null) : null,
    findMedia({ kind: "anime", anilistId: id }),
    latestRating(user.id, id),
    user.role === "admin" ? getMapping(id) : undefined,
  ]);
  if (!a) notFound();
  const entry = list?.get(id);
  // Started once; the hero (Play) and the episode list both wait on it.
  const library = loadLibrary(a, media);

  const [[decorated], requests, current, tmdb] = await Promise.all([
    decorate([animeCard(a)], user),
    media ? db.select().from(schema.requests).where(eq(schema.requests.mediaId, media.id)) : [],
    requestOption(a),
    tmdbPageFor(a).catch(() => null),
  ]);
  const active = requests.filter((r) => r.status !== "declined" && r.status !== "failed");

  const airing = a.nextAiringEpisode
    ? `Ep ${a.nextAiringEpisode.episode} airs ${new Date(a.nextAiringEpisode.airingAt * 1000).toLocaleDateString()}`
    : null;
  const mappingFooter =
    user.role === "admin" ? (
      <MappingOverride
        anilistId={a.id}
        initial={{
          tvdbId: mapping?.tvdbId ?? null,
          tmdbMovieId: mapping?.tmdbMovieId ?? null,
          tvdbSeason: mapping?.tvdbSeason ?? null,
          episodeOffset: mapping?.episodeOffset ?? 0,
        }}
      />
    ) : undefined;

  return (
    <>
      <Hero
        title={aniTitle(a.title)}
        original={a.title.native ?? a.title.romaji}
        poster={a.coverImage.extraLarge ?? a.coverImage.large}
        backdrop={a.bannerImage}
        accentColor={a.coverImage.color}
        facts={[
          a.season && a.seasonYear ? seasonLabel({ season: a.season, year: a.seasonYear }) : a.seasonYear?.toString(),
          a.format && FORMAT_LABEL[a.format],
          a.episodes && a.format !== "MOVIE" ? `${a.episodes} episodes` : null,
          a.duration ? `${a.duration} min` : null,
          a.studios.nodes.map((s) => s.name).join(", "),
          a.averageScore ? <CommunityScore score={a.averageScore} percent /> : null,
          airing,
        ]}
        genres={a.genres}
        overview={aniDescription(a.description)}
        status={decorated.status}
        list={entry ? { status: entry.status, progress: entry.progress, total: a.episodes } : undefined}
        corner={<SourceSwitch active="anilist" anilist={`/anime/${a.id}`} tmdb={tmdb} />}
        aside={
          <AniListPanel
            mediaId={a.id}
            title={aniTitle(a.title)}
            episodes={a.episodes}
            aired={a.nextAiringEpisode ? a.nextAiringEpisode.episode - 1 : null}
            entry={entry ? { status: entry.status, progress: entry.progress, score: entry.score } : null}
            linked={!!token}
            rating={rating ? { scores: rating.scores, total: rating.total, ratedOn: rating.ratedOn } : null}
          />
        }
      >
        <Suspense fallback={<RequestThis entry={current} />}>
          <HeroActions library={library} current={current} requests={active} media={media} progress={token ? (entry?.progress ?? 0) : null} user={user} />
        </Suspense>
      </Hero>

      <AutoHeight>
        <Suspense fallback={<div className="card mb-10 p-6"><JarLoader width={200} label="Loading episodes…" /></div>}>
          <LibrarySection library={library} entry={a} progress={token ? (entry?.progress ?? 0) : null} user={user} />
        </Suspense>
      </AutoHeight>
      <Suspense fallback={null}>
        <MapSection id={a.id} />
      </Suspense>
      {mappingFooter && <section className="card mb-10 p-5">{mappingFooter}</section>}
    </>
  );
}
