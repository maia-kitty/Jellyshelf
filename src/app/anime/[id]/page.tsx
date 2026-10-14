import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { User } from "@/db/schema";
import { Hero } from "@/components/Hero";
import { CardRow } from "@/components/MediaCard";
import { AnimeRequest, type AnimeEntryOption } from "@/components/RequestButtons";
import { MappingOverride } from "@/components/MappingOverride";
import { ListEditor } from "@/components/ListEditor";
import { RatingForm } from "@/components/RatingForm";
import { EpisodeList, JellyfinButton } from "@/components/Episodes";
import { JarLoader } from "@/components/AppIcon";
import { movieInfo, seriesEpisodes } from "@/lib/episodes";
import { findMedia } from "@/lib/media";
import { LIST_LABEL } from "@/components/StatusBadge";
import { anilist, aniTitle, FORMAT_LABEL, franchiseChain, seasonLabel, type AniMediaCard } from "@/lib/clients/anilist";
import { anilistToken } from "@/lib/auth";
import { animeCard, decorate } from "@/lib/cards";
import { getMapping, resolveAnime } from "@/lib/mapping";
import { describeTarget } from "@/lib/mapping/resolve";
import { animeMediaMap } from "@/lib/media";
import { pageUser } from "@/lib/page";
import { debugSleep } from "@/lib/debug";
import { latestRating } from "@/lib/ratings";

function stripHtml(s: string | null) {
  return s
    ?.replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function entryOptions(entries: AniMediaCard[], currentId: number, user: User): Promise<AnimeEntryOption[]> {
  const token = anilistToken(user);
  const [mediaMap, list] = await Promise.all([
    animeMediaMap(entries.map((e) => e.id)),
    token && user.anilistId ? anilist.userList(user.anilistId, token).catch(() => null) : null,
  ]);
  return Promise.all(
    entries.map(async (e) => {
      const { target } = await resolveAnime({ id: e.id, format: e.format, episodes: e.episodes });
      const m = mediaMap.get(e.id);
      const l = list?.get(e.id);
      return {
        id: e.id,
        title: aniTitle(e.title),
        sub: [e.seasonYear, e.format && FORMAT_LABEL[e.format], e.episodes && `${e.episodes} eps`].filter(Boolean).join(" · "),
        target: describeTarget(target),
        mapped: target.service !== "unmapped",
        status: m?.status,
        requested: !!m?.requested,
        current: e.id === currentId,
        list: l ? `${LIST_LABEL[l.status]}${l.status === "CURRENT" ? ` ${l.progress}/${e.episodes ?? "?"}` : ""}` : undefined,
      };
    }),
  );
}

async function Franchise({ entry, user }: { entry: AniMediaCard; user: User }) {
  const chain = await franchiseChain(entry.id).catch(() => []);
  const entries = chain.some((c) => c.id === entry.id) ? chain : [entry];
  return <AnimeRequest entries={await entryOptions(entries, entry.id, user)} />;
}

/** Downloaded episodes of this entry (or the Jellyfin link for a film). Renders nothing if it's in neither Sonarr nor Jellyfin. */
async function AnimeEpisodes({ entry, progress }: { entry: AniMediaCard; progress: number | null }) {
  await debugSleep("episodes");
  const [{ target }, media] = await Promise.all([
    resolveAnime({ id: entry.id, format: entry.format, episodes: entry.episodes }),
    findMedia({ kind: "anime", anilistId: entry.id }),
  ]);
  if (target.service === "radarr") {
    const info = await movieInfo({ itemId: media?.jellyfinItemId, tmdbId: target.tmdbId, anilistId: entry.id });
    return info.playUrl ? (
      <div className="mb-10">
        <JellyfinButton href={info.playUrl} />
      </div>
    ) : null;
  }
  if (target.service !== "sonarr") return null;
  const info = await seriesEpisodes({
    tvdbId: target.tvdbId,
    anilistId: entry.id,
    jellyfinItemId: media?.jellyfinItemId,
    target,
  }).catch(() => null);
  if (!info || (!info.episodes.length && !info.playUrl)) return null;
  return <EpisodeList info={info} anilist={progress !== null ? { mediaId: entry.id, progress } : null} />;
}

export default async function AnimePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const id = Number((await params).id);
  const a = await anilist.media(id);
  if (!a) notFound();

  const token = anilistToken(user);
  const list = token && user.anilistId ? await anilist.userList(user.anilistId, token).catch(() => null) : null;
  const entry = list?.get(id);
  const [decorated] = await decorate([animeCard(a)], user);
  const isSeries = a.format !== "MOVIE";

  const related = a.relations.edges
    .filter((e) => e.node.type === "ANIME" && !(isSeries && ["PREQUEL", "SEQUEL"].includes(e.relationType) && e.node.format !== "MOVIE"))
    .map((e) => ({ ...animeCard(e.node), sub: `${e.relationType.replace("_", " ").toLowerCase()} · ${e.node.format ?? ""}` }));
  const relatedCards = await decorate(related, user);

  const mapping = user.role === "admin" ? await getMapping(id) : undefined;
  const rating = await latestRating(user.id, id);
  const airing = a.nextAiringEpisode
    ? `Ep ${a.nextAiringEpisode.episode} airs ${new Date(a.nextAiringEpisode.airingAt * 1000).toLocaleDateString()}`
    : null;

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
          a.averageScore ? `★ ${a.averageScore}%` : null,
          airing,
        ]}
        genres={a.genres}
        overview={stripHtml(a.description)}
        status={decorated.status}
        list={entry ? { status: entry.status, progress: entry.progress, total: a.episodes } : undefined}
      >
        <a className="text-sm text-anilist hover:underline" href={`https://anilist.co/anime/${a.id}`} target="_blank" rel="noreferrer">
          Open on AniList ↗
        </a>
      </Hero>

      <div className="mb-10 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Suspense fallback={<AnimeRequest entries={await entryOptions([a], a.id, user)} />}>
          <Franchise entry={a} user={user} />
        </Suspense>
        <div className="space-y-6">
          {token ? (
            <ListEditor
              mediaId={a.id}
              episodes={a.episodes}
              aired={a.nextAiringEpisode ? a.nextAiringEpisode.episode - 1 : null}
              entry={entry ? { status: entry.status, progress: entry.progress, score: entry.score } : null}
            />
          ) : (
            <div className="card p-4 text-sm text-muted">
              <a className="text-anilist hover:underline" href="/api/auth/anilist">
                Link AniList
              </a>{" "}
              to track episodes and status here.
            </div>
          )}
          <RatingForm
            anilistId={a.id}
            canPush={!!token}
            previous={rating ? { scores: rating.scores, total: rating.total, ratedOn: rating.ratedOn } : null}
          />
          {user.role === "admin" && (
            <MappingOverride
              anilistId={a.id}
              initial={{
                tvdbId: mapping?.tvdbId ?? null,
                tmdbMovieId: mapping?.tmdbMovieId ?? null,
                tvdbSeason: mapping?.tvdbSeason ?? null,
                episodeOffset: mapping?.episodeOffset ?? 0,
              }}
            />
          )}
        </div>
      </div>
      <Suspense fallback={<div className="card mb-10 p-6"><JarLoader width={200} label="Loading episodes…" /></div>}>
        <AnimeEpisodes entry={a} progress={token ? (entry?.progress ?? 0) : null} />
      </Suspense>
      <CardRow title="Related" cards={relatedCards} />
    </>
  );
}
