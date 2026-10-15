import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import type { AniListEntry, AniMediaCard } from "@/lib/clients/anilist";
import { jellyfin, type JellyfinItem } from "@/lib/clients/jellyfin";
import { tmdbClient } from "@/lib/clients/tmdb";
import { getSettings } from "@/lib/settings";
import { animeCard, movieCard, tvCard, type Card } from "@/lib/cards";

type Dated = { card: Card; at: number };

/**
 * One "continue watching" row: anime you're watching on AniList plus movies and series you're part-way
 * through in Jellyfin, most recently touched first. Jellyfin titles that are the same show as an AniList
 * entry are left to the AniList card.
 */
export async function continueWatching(user: User, list: Map<number, AniListEntry & { media: AniMediaCard }> | null): Promise<Card[]> {
  const watching = list ? [...list.values()].filter((e) => e.status === "CURRENT" || e.status === "REPEATING") : [];
  const anime: Dated[] = watching.map((e) => ({
    card: {
      ...animeCard(e.media),
      sub: e.media.episodes && e.progress >= e.media.episodes ? "All watched" : `Next: episode ${e.progress + 1}${e.media.episodes ? ` of ${e.media.episodes}` : ""}`,
      watched: e.media.episodes ? Math.min(1, e.progress / e.media.episodes) : undefined,
    },
    at: e.updatedAt * 1000,
  }));
  const fromJellyfin = await jellyfinWatching(user, new Set(watching.map((e) => e.mediaId))).catch((e) => {
    console.warn("[continue watching] jellyfin:", (e as Error).message);
    return [];
  });
  return [...anime, ...fromJellyfin].sort((a, b) => b.at - a.at).map((d) => d.card).slice(0, 30);
}

const ticks = (it: JellyfinItem) =>
  it.RunTimeTicks && it.UserData?.PlaybackPositionTicks ? it.UserData.PlaybackPositionTicks / it.RunTimeTicks : undefined;
const episodeCode = (ep: JellyfinItem) => `S${ep.ParentIndexNumber ?? "?"}E${ep.IndexNumber ?? "?"}`;

async function jellyfinWatching(user: User, anilistWatching: Set<number>): Promise<Dated[]> {
  const s = await getSettings();
  if (!s.jellyfin.url || !s.jellyfin.apiKey || !user.jellyfinUserId) return [];
  const uid = user.jellyfinUserId;
  const api = jellyfin(s.jellyfin);
  const [resume, nextUp] = await Promise.all([api.resume(uid), api.nextUp(uid)]);

  // One entry per series: a half-watched episode beats "next up".
  const shows = new Map<string, { ep: JellyfinItem; inProgress: boolean; at: number | null }>();
  for (const ep of resume.filter((it) => it.Type === "Episode" && it.SeriesId)) {
    if (!shows.has(ep.SeriesId!)) shows.set(ep.SeriesId!, { ep, inProgress: true, at: Date.parse(ep.UserData?.LastPlayedDate ?? "") || null });
  }
  for (const ep of nextUp.filter((it) => it.SeriesId)) {
    if (!shows.has(ep.SeriesId!)) shows.set(ep.SeriesId!, { ep, inProgress: false, at: null });
  }
  const [series, dates] = await Promise.all([
    api.items(uid, [...shows.keys()]),
    Promise.all([...shows].map(async ([id, sh]) => [id, sh.at ?? (Date.parse((await api.lastPlayedIn(uid, id)) ?? "") || 0)] as const)),
  ]);
  const at = new Map(dates);
  const movies = resume.filter((it) => it.Type === "Movie" && it.ProviderIds?.Tmdb);

  // The same show/film already showing from AniList (matched by the AniList plugin's id, or via the mapping table).
  const tvdbIds = series.map((x) => Number(x.ProviderIds?.Tvdb)).filter(Boolean);
  const tmdbMovieIds = movies.map((m) => Number(m.ProviderIds!.Tmdb));
  const covered = new Set<string>();
  if (anilistWatching.size && (tvdbIds.length || tmdbMovieIds.length)) {
    const maps = await db
      .select()
      .from(schema.idMapping)
      .where(inArray(schema.idMapping.anilistId, [...anilistWatching]));
    for (const m of maps) {
      if (m.tvdbId && tvdbIds.includes(m.tvdbId)) covered.add(`tvdb:${m.tvdbId}`);
      if (m.tmdbMovieId && tmdbMovieIds.includes(m.tmdbMovieId)) covered.add(`movie:${m.tmdbMovieId}`);
    }
  }
  const viaPlugin = (it: JellyfinItem) => !!it.ProviderIds?.AniList && anilistWatching.has(Number(it.ProviderIds.AniList));
  const hasTmdb = !!s.tmdb.apiKey;

  const out = await Promise.all([
    ...series.map(async (show): Promise<Dated | null> => {
      const tmdbId = Number(show.ProviderIds?.Tmdb);
      if (!tmdbId || viaPlugin(show) || covered.has(`tvdb:${show.ProviderIds?.Tvdb}`)) return null;
      const sh = shows.get(show.Id)!;
      const base = hasTmdb ? await tmdbClient.tv(tmdbId).then(tvCard, () => null) : null;
      const card: Card = base ?? { kind: "tv", id: tmdbId, title: show.Name, poster: null, year: show.ProductionYear ?? null, href: `/tv/${tmdbId}` };
      const played = show.UserData?.PlayedPercentage;
      return {
        card: {
          ...card,
          sub: sh.inProgress ? `Resume ${episodeCode(sh.ep)}` : `Next: ${episodeCode(sh.ep)}`,
          watched: played ? played / 100 : undefined,
          playHref: `/watch/${sh.ep.Id}`,
        },
        at: at.get(show.Id) ?? 0,
      };
    }),
    ...movies.map(async (mv): Promise<Dated | null> => {
      const tmdbId = Number(mv.ProviderIds!.Tmdb);
      if (viaPlugin(mv) || covered.has(`movie:${tmdbId}`)) return null;
      const base = hasTmdb ? await tmdbClient.movie(tmdbId).then(movieCard, () => null) : null;
      const card: Card = base ?? { kind: "movie", id: tmdbId, title: mv.Name, poster: null, year: mv.ProductionYear ?? null, href: `/movie/${tmdbId}` };
      return { card: { ...card, sub: "Resume movie", watched: ticks(mv), playHref: `/watch/${mv.Id}` }, at: Date.parse(mv.UserData?.LastPlayedDate ?? "") || 0 };
    }),
  ]);
  return out.filter((d): d is Dated => d !== null);
}
