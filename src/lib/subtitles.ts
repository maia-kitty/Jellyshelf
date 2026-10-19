import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Media, Request, User } from "@/db/schema";
import { bazarr, type BazarrEpisode, type BazarrSub } from "@/lib/clients/bazarr";
import { radarr } from "@/lib/clients/radarr";
import { sonarr } from "@/lib/clients/sonarr";
import { cached, invalidate } from "@/lib/cache";
import { inScope } from "@/lib/downloads";
import { trackLangs } from "@/lib/langs";
import { getSettings } from "@/lib/settings";

/** Subtitles of one file: languages present and languages Bazarr's profile still wants. */
export interface FileSubs {
  have: string[];
  missing: string[];
}

/** Across several files (a season, a request): which languages are complete and how many files lack each. */
export interface SubsSummary {
  files: number;
  have: string[];
  missing: { lang: string; files: number }[];
}

/** "EN", "EN HI", "JA forced" */
export const subLabel = (s: Pick<BazarrSub, "code2" | "forced" | "hi">) => `${s.code2.toUpperCase()}${s.forced ? " forced" : ""}${s.hi ? " HI" : ""}`;

const uniq = (xs: string[]) => [...new Set(xs)];

export function fileSubs(x: Pick<BazarrEpisode, "subtitles" | "missing_subtitles">): FileSubs {
  return { have: uniq(x.subtitles.map(subLabel)), missing: uniq(x.missing_subtitles.map(subLabel)) };
}

export function summarize(files: FileSubs[]): SubsSummary {
  const missing = new Map<string, number>();
  for (const f of files) for (const l of f.missing) missing.set(l, (missing.get(l) ?? 0) + 1);
  return {
    files: files.length,
    have: uniq(files.flatMap((f) => f.have)).sort(),
    missing: [...missing].map(([lang, n]) => ({ lang, files: n })).sort((a, b) => b.files - a.files),
  };
}

/**
 * Bazarr only counts subtitle tracks inside the video file when its "Use embedded subtitles" is on; count them either way,
 * from Sonarr/Radarr's read of the file. Its track list has no forced/HI flags, so any track in the language will do.
 */
export function withEmbedded<T extends Pick<BazarrEpisode, "subtitles" | "missing_subtitles">>(x: T, tracks: string | null | undefined): T {
  const inFile = new Set(trackLangs(tracks));
  const covered = x.missing_subtitles.filter((s) => inFile.has(s.code2.toUpperCase()));
  if (!covered.length) return x;
  // A null path is how Bazarr itself marks an embedded subtitle.
  return { ...x, subtitles: [...x.subtitles, ...covered.map((s) => ({ ...s, path: null }))], missing_subtitles: x.missing_subtitles.filter((s) => !covered.includes(s)) };
}

export async function bazarrApi() {
  const s = (await getSettings()).bazarr;
  return s.url && s.apiKey ? bazarr(s) : null;
}

/** Bazarr's view of a series, shared for a few seconds. Null when Bazarr isn't set up or can't be reached. */
export async function seriesSubs(sonarrSeriesId: number): Promise<BazarrEpisode[] | null> {
  const api = await bazarrApi();
  if (!api) return null;
  return cached(`bazarr:series:${sonarrSeriesId}`, 30, async () => {
    const s = (await getSettings()).sonarr;
    const [eps, files] = await Promise.all([
      api.episodes(sonarrSeriesId),
      s.url && s.apiKey ? sonarr(s).episodes(sonarrSeriesId, true).catch(() => []) : [],
    ]);
    const tracks = new Map(files.map((e) => [e.id, e.episodeFile?.mediaInfo?.subtitles]));
    return eps.map((e) => withEmbedded(e, tracks.get(e.sonarrEpisodeId)));
  }).catch(() => null);
}

export async function movieSubs(radarrId: number): Promise<FileSubs | null> {
  const api = await bazarrApi();
  if (!api) return null;
  const m = await cached(`bazarr:movie:${radarrId}`, 30, async () => {
    const s = (await getSettings()).radarr;
    const [m, file] = await Promise.all([api.movie(radarrId), s.url && s.apiKey ? radarr(s).movie(radarrId).catch(() => null) : null]);
    return m && withEmbedded(m, file?.movieFile?.mediaInfo?.subtitles);
  }).catch(() => null);
  return m ? fileSubs(m) : null;
}

/** After a search or download, so the next page load asks Bazarr again. */
export const forgetSubs = () => invalidate("bazarr:");

type Scope = Pick<Request, "target" | "absolute" | "seasons" | "episodeRanges">;

/** Subtitle summary for just the files a request covers (a split-cour request ignores the rest of the series). */
export async function requestSubs(req: Scope, media: Pick<Media, "sonarrId" | "radarrId">): Promise<SubsSummary | null> {
  if (req.target === "radarr") {
    const m = media.radarrId ? await movieSubs(media.radarrId) : null;
    return m ? summarize([m]) : null;
  }
  if (!media.sonarrId) return null;
  const eps = await seriesSubs(media.sonarrId);
  if (!eps?.length) return null;
  // Bazarr doesn't know absolute numbers; Sonarr does.
  let absolute = new Map<number, number>();
  if (req.absolute && req.episodeRanges?.length) {
    const s = (await getSettings()).sonarr;
    const son = await cached(`sonarr:eps:${media.sonarrId}`, 60, () => sonarr(s).episodes(media.sonarrId!)).catch(() => []);
    absolute = new Map(son.filter((e) => e.absoluteEpisodeNumber).map((e) => [e.id, e.absoluteEpisodeNumber!]));
  }
  const files = eps
    .filter((e) => inScope({ seasonNumber: e.season, episodeNumber: e.episode, absoluteEpisodeNumber: absolute.get(e.sonarrEpisodeId) }, req))
    .map(fileSubs);
  return files.length ? summarize(files) : null;
}

/** Admins always; others only when allowed in settings and they've requested this series/movie. */
export async function canFixSubs(user: User, t: { kind: "series" | "movie"; id: number }) {
  if (user.role === "admin") return true;
  if ((await getSettings()).bazarr.fixSubsBy !== "requesters") return false;
  const [row] = await db
    .select({ id: schema.requests.id })
    .from(schema.requests)
    .innerJoin(schema.media, eq(schema.media.id, schema.requests.mediaId))
    .where(
      and(
        eq(schema.requests.userId, user.id),
        ne(schema.requests.status, "declined"),
        t.kind === "series" ? eq(schema.media.sonarrId, t.id) : eq(schema.media.radarrId, t.id),
      ),
    )
    .limit(1);
  return !!row;
}
