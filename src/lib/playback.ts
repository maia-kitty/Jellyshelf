import { redirect } from "next/navigation";
import { eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { anilistToken, jellyfinToken, type JellyfinCredentials } from "@/lib/auth";
import { latestRating } from "@/lib/ratings";
import { viewerToday } from "@/lib/today";
import { authHeader } from "@/lib/clients/jellyfin";
import { fetchJson, joinUrl } from "@/lib/clients/http";
import { sonarr } from "@/lib/clients/sonarr";
import { anilist, aniTitle } from "@/lib/clients/anilist";
import { cached } from "@/lib/cache";
import { getSettings } from "@/lib/settings";
import { trackLabel } from "@/lib/langs";
import { chapterSegments } from "./chapters";
import type { BrowserCaps, PlayReport, PlayRequest, PlaySource, Segment, SubtitleTrack, Trickplay, WatchMeta } from "./playbackTypes";

export class NeedsJellyfinLogin extends Error {
  constructor() {
    super("Sign in with Jellyfin again to watch");
  }
}

/** Jellyfin API as the signed-in user (their token, their device). */
export async function asUser(user: User) {
  const creds = jellyfinToken(user);
  if (!creds || !user.jellyfinUserId) throw new NeedsJellyfinLogin();
  const { jellyfin: jf } = await getSettings();
  if (!jf.url) throw new Error("Jellyfin is not configured");
  const call = <T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}) =>
    fetchJson<T>(joinUrl(jf.url, path), { ...init, headers: { Authorization: authHeader(creds.token, creds.deviceId) } });
  return { call, creds, userId: user.jellyfinUserId };
}

/** Jellyfin hands out paths that work against itself; the browser reaches them through /api/jf, minus any key. */
export function relayUrl(path: string) {
  const u = new URL(path, "http://x");
  u.searchParams.delete("ApiKey");
  u.searchParams.delete("api_key");
  return `/api/jf${u.pathname}${u.search}`;
}

const TICKS = 10_000_000;

// ---------- choosing how to play ----------

function deviceProfile(caps: BrowserCaps, maxBitrate?: number) {
  const v = caps.video;
  const a = caps.audio;
  const videoCodecs = [v.h264 && "h264", v.hevc && "hevc", v.vp9 && "vp9", v.av1 && "av1"].filter(Boolean).join(",");
  const audioCodecs = [a.aac && "aac", a.mp3 && "mp3", a.opus && "opus", a.flac && "flac", a.ac3 && "ac3", a.eac3 && "eac3"].filter(Boolean).join(",");
  // What the transcoder may produce: the HLS segments must be playable here too.
  const hlsVideo = [v.hevc && "hevc", "h264"].filter(Boolean).join(",");
  const hlsAudio = ["aac", a.ac3 && "ac3", a.eac3 && "eac3", a.mp3 && "mp3"].filter(Boolean).join(",");
  return {
    MaxStreamingBitrate: maxBitrate ?? 120_000_000,
    MaxStaticBitrate: 100_000_000,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: [
      { Container: ["mp4", "m4v", "webm", caps.mkv && "mkv"].filter(Boolean).join(","), Type: "Video", VideoCodec: videoCodecs, AudioCodec: audioCodecs },
    ],
    TranscodingProfiles: [
      {
        Container: "mp4",
        Type: "Video",
        Protocol: "hls",
        VideoCodec: hlsVideo,
        AudioCodec: hlsAudio,
        Context: "Streaming",
        MaxAudioChannels: String(caps.maxChannels),
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    // Styled subtitles stay files (JASSUB draws them); text ones become WebVTT; anything else (PGS, VobSub) is burned in.
    SubtitleProfiles: [
      { Format: "ass", Method: "External" },
      { Format: "ssa", Method: "External" },
      { Format: "vtt", Method: "External" },
    ],
  };
}

interface JfStream {
  Index: number;
  Type: "Video" | "Audio" | "Subtitle" | "Attachment" | string;
  Codec?: string;
  Language?: string | null;
  Title?: string | null;
  DisplayTitle?: string | null;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsHearingImpaired?: boolean;
  DeliveryMethod?: "External" | "Encode" | "Embed" | "Hls" | null;
  DeliveryUrl?: string | null;
  Width?: number;
  Height?: number;
  BitRate?: number;
}
interface JfMediaSource {
  Id: string;
  Container: string;
  SupportsDirectPlay: boolean;
  SupportsDirectStream: boolean;
  TranscodingUrl?: string | null;
  TranscodeReasons?: string[] | string | null;
  RunTimeTicks?: number;
  MediaStreams: JfStream[];
  MediaAttachments?: { Index: number; MimeType?: string; DeliveryUrl?: string | null; FileName?: string }[];
  DefaultAudioStreamIndex?: number | null;
  DefaultSubtitleStreamIndex?: number | null;
}

const lang = (l?: string | null) => (l && l !== "und" ? l : null);
/** Tracks that still read the same after trackLabel get a number each ("English 1", "English 2"). */
const numbered = <T extends { label: string }>(list: T[]) =>
  list.map((t) => {
    const same = list.filter((o) => o.label === t.label);
    return same.length > 1 ? { ...t, label: `${t.label} ${same.indexOf(t) + 1}` } : t;
  });
const isStyled = (codec?: string) => codec === "ass" || codec === "ssa";

export async function playSource(user: User, itemId: string, req: PlayRequest): Promise<PlaySource> {
  const jf = await asUser(user);
  const first = await jf.call<{ MediaSources: JfMediaSource[]; PlaySessionId: string }>(`/Items/${itemId}/PlaybackInfo?userId=${jf.userId}`, {
    method: "POST",
    body: { DeviceProfile: deviceProfile(req.caps, req.maxBitrate), AutoOpenLiveStream: true },
  });
  const probe = first.MediaSources[0];
  if (!probe) throw new Error("Nothing to play");

  // Browsers can't switch audio tracks inside a file, and image subtitles have to be drawn in by the server; either way
  // Jellyfin needs to know before it builds the stream.
  const defaultAudio = probe.DefaultAudioStreamIndex ?? probe.MediaStreams.find((s) => s.Type === "Audio")?.Index ?? null;
  const audioIndex = req.audioIndex ?? defaultAudio;
  const subs = probe.MediaStreams.filter((s) => s.Type === "Subtitle");
  const subtitleIndex = req.subtitleIndex === undefined ? (probe.DefaultSubtitleStreamIndex ?? -1) : req.subtitleIndex;
  const chosenSub = subs.find((s) => s.Index === subtitleIndex);
  const burn = !!chosenSub && chosenSub.DeliveryMethod === "Encode";
  const otherAudio = audioIndex !== null && audioIndex !== defaultAudio;
  const needsStream = req.noDirectPlay || otherAudio || burn || !!req.maxBitrate;

  const info = needsStream
    ? await jf.call<{ MediaSources: JfMediaSource[]; PlaySessionId: string }>(`/Items/${itemId}/PlaybackInfo?userId=${jf.userId}`, {
        method: "POST",
        body: {
          DeviceProfile: deviceProfile(req.caps, req.maxBitrate),
          MediaSourceId: probe.Id,
          AudioStreamIndex: audioIndex ?? undefined,
          SubtitleStreamIndex: burn ? subtitleIndex : -1,
          EnableDirectPlay: false,
          EnableDirectStream: true,
          EnableTranscoding: true,
          AllowVideoStreamCopy: true,
          AllowAudioStreamCopy: true,
          AutoOpenLiveStream: true,
        },
      })
    : first;
  const src = info.MediaSources[0];

  const direct = !needsStream && src.SupportsDirectPlay;
  if (!direct && !src.TranscodingUrl) throw new Error("Jellyfin can't stream this file for your browser");
  const url = direct
    ? relayUrl(`/Videos/${itemId}/stream?static=true&mediaSourceId=${src.Id}&playSessionId=${info.PlaySessionId}&deviceId=${jf.creds.deviceId}`)
    : relayUrl(src.TranscodingUrl!);
  // Jellyfin puts the reasons in the stream URL rather than the response.
  const fromUrl = src.TranscodingUrl ? new URL(src.TranscodingUrl, "http://x").searchParams.get("TranscodeReasons") : null;
  const raw = src.TranscodeReasons ?? fromUrl;
  const reasons = Array.isArray(raw) ? raw : raw ? String(raw).split(",") : [];
  const video = src.MediaStreams.find((s) => s.Type === "Video");

  return {
    itemId,
    mediaSourceId: src.Id,
    playSessionId: info.PlaySessionId,
    mode: direct ? "direct" : "hls",
    playMethod: direct ? "DirectPlay" : reasons.some((r) => /Video|Bitrate|Resolution|Subtitle/i.test(r)) || burn ? "Transcode" : "DirectStream",
    url,
    transcodeReasons: reasons,
    runTimeTicks: src.RunTimeTicks ?? probe.RunTimeTicks ?? 0,
    audio: numbered(
      src.MediaStreams.filter((s) => s.Type === "Audio").map((s) => ({
        index: s.Index,
        label: trackLabel({ title: s.Title, language: lang(s.Language) }, "Audio"),
        language: lang(s.Language),
        isDefault: s.Index === defaultAudio,
      })),
    ),
    subtitles: numbered(subs.map((s): SubtitleTrack => {
      const kind = isStyled(s.Codec) ? "ass" : s.DeliveryMethod === "Encode" ? "burn" : "vtt";
      // Older Jellyfin only says so in the title.
      const hi = !!s.IsHearingImpaired || /\bsdh\b|hearing/i.test(`${s.Title ?? ""} ${s.DisplayTitle ?? ""}`);
      const delivery = probe.MediaStreams.find((p) => p.Index === s.Index)?.DeliveryUrl ?? s.DeliveryUrl;
      return {
        index: s.Index,
        label: trackLabel({ title: s.Title, language: lang(s.Language), hi, forced: s.IsForced }, "Subtitles"),
        language: lang(s.Language),
        isDefault: !!s.IsDefault,
        isForced: !!s.IsForced,
        hi,
        kind,
        url:
          kind === "burn"
            ? null
            : relayUrl(delivery ?? `/Videos/${itemId}/${src.Id}/Subtitles/${s.Index}/0/Stream.${kind === "ass" ? s.Codec : "vtt"}`),
      };
    })),
    audioIndex,
    subtitleIndex: subtitleIndex >= 0 ? subtitleIndex : null,
    fonts: (src.MediaAttachments ?? probe.MediaAttachments ?? [])
      .filter((a) => /font|truetype|opentype|octet/i.test(a.MimeType ?? "") || /\.(ttf|otf|woff2?)$/i.test(a.FileName ?? ""))
      .map((a) => relayUrl(a.DeliveryUrl ?? `/Videos/${itemId}/${src.Id}/Attachments/${a.Index}`)),
    video: { codec: video?.Codec ?? null, width: video?.Width ?? null, height: video?.Height ?? null, bitrate: video?.BitRate ?? null },
  };
}

// ---------- the watch page ----------

interface JfItem {
  Id: string;
  Name: string;
  Type: string;
  SeriesId?: string;
  SeriesName?: string;
  SeasonId?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  RunTimeTicks?: number;
  ProviderIds?: Record<string, string>;
  UserData?: { PlaybackPositionTicks?: number; Played?: boolean };
  BackdropImageTags?: string[];
  ParentBackdropItemId?: string;
  ImageTags?: Record<string, string>;
  Trickplay?: Record<string, Record<string, { Width: number; Height: number; TileWidth: number; TileHeight: number; ThumbnailCount: number; Interval: number }>>;
  LocationType?: string;
  Chapters?: { Name?: string; StartPositionTicks: number }[];
}

const epLabel = (e: JfItem) => `S${e.ParentIndexNumber ?? "?"} E${e.IndexNumber ?? "?"}`;

export async function watchMeta(user: User, itemId: string): Promise<WatchMeta> {
  const jf = await asUser(user);
  const item = await jf.call<JfItem>(`/Items/${itemId}?userId=${jf.userId}&Fields=ProviderIds,Trickplay,Chapters`);
  if (item.Type === "Series") {
    // e.g. after signing in from /watch/series/…: start the right episode instead.
    const ep = await firstToPlay(user, itemId);
    if (ep) redirect(`/watch/${ep}`);
  }
  const series = item.SeriesId ? await jf.call<JfItem>(`/Items/${item.SeriesId}?userId=${jf.userId}&Fields=ProviderIds`) : null;

  let next: WatchMeta["next"] = null;
  let prev: WatchMeta["prev"] = null;
  if (item.Type === "Episode" && item.SeriesId) {
    // A plain item query in season/episode order: /Shows/{id}/Episodes comes back empty for series whose seasons
    // haven't been through a metadata refresh.
    const eps = (
      await jf.call<{ Items: JfItem[] }>(
        `/Items?userId=${jf.userId}&ParentId=${item.SeriesId}&Recursive=true&IncludeItemTypes=Episode&SortBy=ParentIndexNumber,IndexNumber&Fields=ProviderIds&IsMissing=false`,
      )
    ).Items.filter((e) => e.LocationType !== "Virtual" && (e.ParentIndexNumber ?? 1) > 0);
    const i = eps.findIndex((e) => e.Id === item.Id);
    const n = i >= 0 ? eps[i + 1] : undefined;
    const p = i > 0 ? eps[i - 1] : undefined;
    if (n) next = { id: n.Id, title: n.Name, label: epLabel(n), thumb: relayUrl(`/Items/${n.Id}/Images/Primary?maxWidth=480`) };
    if (p) prev = { id: p.Id, label: epLabel(p) };
  }

  const [segments, target] = await Promise.all([
    jf
      .call<{ Items: { Type: Segment["type"]; StartTicks: number; EndTicks: number }[] }>(`/MediaSegments/${itemId}`)
      .then((r) => r.Items.map((s) => ({ type: s.Type, start: s.StartTicks / TICKS, end: s.EndTicks / TICKS })))
      .catch(() => [])
      // Nothing detected by Jellyfin: many releases name their chapters (Opening, Ending, Preview…), so use those.
      .then((found) =>
        found.length ? found : chapterSegments((item.Chapters ?? []).map((c) => ({ name: c.Name ?? "", start: c.StartPositionTicks / TICKS })), (item.RunTimeTicks ?? 0) / TICKS),
      ),
    anilistTarget(item, series).catch(() => null),
  ]);

  const tp = item.Trickplay && Object.values(item.Trickplay)[0];
  const tpWidth = tp && Object.keys(tp).map(Number).sort((a, b) => a - b)[0];
  const trickplay: Trickplay | null =
    tp && tpWidth
      ? {
          url: relayUrl(`/Videos/${itemId}/Trickplay/${tpWidth}/{index}.jpg?mediaSourceId=${Object.keys(item.Trickplay!)[0]}`),
          width: tp[tpWidth].Width,
          height: tp[tpWidth].Height,
          tileWidth: tp[tpWidth].TileWidth,
          tileHeight: tp[tpWidth].TileHeight,
          count: tp[tpWidth].ThumbnailCount,
          interval: tp[tpWidth].Interval,
        }
      : null;

  const last = target && (item.Type === "Movie" || (target.episodes !== null && target.episode >= target.episodes));
  const finale = last && !(await latestRating(user.id, target.mediaId))
    ? { anilistId: target.mediaId, title: target.title, canPush: !!user.anilistId && !!anilistToken(user) }
    : null;

  const backdropOf = item.BackdropImageTags?.length ? item.Id : (item.ParentBackdropItemId ?? series?.Id ?? null);
  const resume = item.UserData?.Played ? 0 : (item.UserData?.PlaybackPositionTicks ?? 0) / TICKS;
  return {
    itemId,
    title: item.Type === "Episode" ? item.Name : item.Name,
    subtitle: item.Type === "Episode" ? `${item.SeriesName} · ${epLabel(item)}` : null,
    backdrop: backdropOf ? relayUrl(`/Items/${backdropOf}/Images/Backdrop?maxWidth=1920`) : null,
    backHref: await backHref(item, series, target?.mediaId ?? null),
    resumeAt: resume > 10 ? resume : 0,
    runTime: (item.RunTimeTicks ?? 0) / TICKS,
    next,
    prev,
    segments,
    trickplay,
    anilist: target,
    finale,
  };
}

/** The Jellyshelf page for what's playing: the AniList entry, else the TMDB movie/series page, else the library. */
async function backHref(item: JfItem, series: JfItem | null, anilistId: number | null) {
  if (anilistId) return `/anime/${anilistId}`;
  const ids = (series ?? item).ProviderIds ?? {};
  if (ids.Tmdb) return item.Type === "Movie" ? `/movie/${ids.Tmdb}` : `/tv/${ids.Tmdb}`;
  return "/library";
}

// ---------- AniList ----------

/**
 * Which AniList entry and episode number this Jellyfin item is, through the same TVDB/TMDB mapping requests use:
 * season-based entries by their episode offset, absolute-numbered ones via Sonarr's absolute numbers.
 */
export async function anilistTarget(item: JfItem, series: JfItem | null): Promise<WatchMeta["anilist"]> {
  if (item.Type === "Movie") {
    const tmdb = Number(item.ProviderIds?.Tmdb);
    if (!tmdb) return null;
    const [o] = await db.select().from(schema.idMappingOverride).where(eq(schema.idMappingOverride.tmdbMovieId, tmdb));
    const [m] = o ? [o] : await db.select().from(schema.idMapping).where(eq(schema.idMapping.tmdbMovieId, tmdb));
    return m ? withTitle(m.anilistId, 1) : null;
  }
  if (item.Type !== "Episode" || !series) return null;
  const tvdb = Number(series.ProviderIds?.Tvdb);
  const season = item.ParentIndexNumber;
  const ep = item.IndexNumber;
  if (!tvdb || season === undefined || ep === undefined) return null;
  const base = await db.select().from(schema.idMapping).where(eq(schema.idMapping.tvdbId, tvdb));
  // Admin fixes win: drop entries an override moved elsewhere, add ones it moved here.
  const overrides = await db
    .select()
    .from(schema.idMappingOverride)
    .where(
      base.length
        ? or(eq(schema.idMappingOverride.tvdbId, tvdb), inArray(schema.idMappingOverride.anilistId, base.map((m) => m.anilistId)))
        : eq(schema.idMappingOverride.tvdbId, tvdb),
    );
  const overridden = new Set(overrides.map((o) => o.anilistId));
  const maps = [...base.filter((m) => !overridden.has(m.anilistId)), ...overrides.filter((o) => o.tvdbId === tvdb)];

  const bySeason = maps
    .filter((m) => m.tvdbSeason === season && (m.episodeOffset ?? 0) < ep)
    .sort((a, b) => (b.episodeOffset ?? 0) - (a.episodeOffset ?? 0))[0];
  if (bySeason) return withTitle(bySeason.anilistId, ep - (bySeason.episodeOffset ?? 0));

  const absolute = maps.filter((m) => m.tvdbSeason === -1);
  if (absolute.length) {
    const abs = await absoluteNumber(tvdb, season, ep);
    const m = abs && absolute.filter((x) => (x.episodeOffset ?? 0) < abs).sort((a, b) => (b.episodeOffset ?? 0) - (a.episodeOffset ?? 0))[0];
    if (m && abs) return withTitle(m.anilistId, abs - (m.episodeOffset ?? 0));
  }
  return null;
}

async function withTitle(mediaId: number, episode: number) {
  const [m] = await anilist.byIds([mediaId]).catch(() => []);
  return { mediaId, episode, title: m ? aniTitle(m.title) : `AniList #${mediaId}`, episodes: m?.episodes ?? null };
}

async function absoluteNumber(tvdb: number, season: number, ep: number) {
  const s = (await getSettings()).sonarr;
  if (!s.url || !s.apiKey) return null;
  const api = sonarr(s);
  const series = await cached(`sonarr:tvdb:${tvdb}`, 600, () => api.seriesByTvdb(tvdb)).catch(() => null);
  if (!series?.id) return null;
  const eps = await cached(`sonarr:eps:${series.id}`, 600, () => api.episodes(series.id!)).catch(() => []);
  return eps.find((e) => e.seasonNumber === season && e.episodeNumber === ep)?.absoluteEpisodeNumber ?? null;
}

// ---------- reporting ----------

/** Sessions that already moved AniList, so a long tail of progress reports doesn't repeat it. */
const g = globalThis as unknown as { __scrobbledAt?: Map<string, number> };
const scrobbled = (g.__scrobbledAt ??= new Map());
/** A session's reports stop once the player closes, so a day later its id is only taking up memory. */
const SCROBBLE_MEMORY_MS = 24 * 60 * 60 * 1000;

function markScrobbled(playSessionId: string) {
  const now = Date.now();
  for (const [id, at] of scrobbled) if (now - at > SCROBBLE_MEMORY_MS) scrobbled.delete(id);
  scrobbled.set(playSessionId, now);
}

export async function report(user: User, r: PlayReport) {
  const jf = await asUser(user);
  const body = {
    ItemId: r.itemId,
    MediaSourceId: r.mediaSourceId,
    PlaySessionId: r.playSessionId,
    PositionTicks: Math.round(r.position * TICKS),
    IsPaused: r.paused,
    PlayMethod: r.playMethod,
    AudioStreamIndex: r.audioIndex ?? undefined,
    SubtitleStreamIndex: r.subtitleIndex ?? -1,
    CanSeek: true,
    EventName: r.paused ? "pause" : "timeupdate",
  };
  const path = r.event === "start" ? "/Sessions/Playing" : r.event === "progress" ? "/Sessions/Playing/Progress" : "/Sessions/Playing/Stopped";
  await jf.call(path, { method: "POST", body });
  if (r.event === "stop") {
    // Stop any transcode for this session right away rather than when Jellyfin notices.
    await jf.call(`/Videos/ActiveEncodings?deviceId=${encodeURIComponent(jf.creds.deviceId)}&playSessionId=${encodeURIComponent(r.playSessionId)}`, { method: "DELETE" }).catch(() => {});
  }

  let anilistUpdate: { mediaId: number; episode: number } | null = null;
  if (r.duration > 0 && r.position / r.duration >= 0.9 && !scrobbled.has(r.playSessionId)) {
    markScrobbled(r.playSessionId);
    anilistUpdate = await scrobble(user, jf, r.itemId).catch((e) => {
      console.warn("[anilist sync]", (e as Error).message);
      return null;
    });
  }
  return { ok: true, anilist: anilistUpdate };
}

async function scrobble(user: User, jf: Awaited<ReturnType<typeof asUser>>, itemId: string) {
  const token = anilistToken(user);
  if (!token || !user.anilistId) return null;
  const item = await jf.call<JfItem>(`/Items/${itemId}?userId=${jf.userId}&Fields=ProviderIds`);
  const series = item.SeriesId ? await jf.call<JfItem>(`/Items/${item.SeriesId}?userId=${jf.userId}&Fields=ProviderIds`) : null;
  const target = await anilistTarget(item, series);
  if (!target) return null;
  const { listPatch } = await import("@/lib/listEntry");
  const [list, media] = await Promise.all([anilist.userList(user.anilistId, token), anilist.media(target.mediaId)]);
  const entry = list.get(target.mediaId);
  // Only ever forward: rewatching episode 3 shouldn't undo progress at 10.
  if (entry && entry.progress >= target.episode && entry.status !== "REPEATING") return null;
  const patch = listPatch(entry, media?.episodes ?? null, { kind: "progress", value: target.episode }, await viewerToday());
  if (!entry) patch.status = media?.episodes && target.episode >= media.episodes ? "COMPLETED" : "CURRENT";
  await anilist.updateListEntry(user.anilistId, token, target.mediaId, patch);
  return { mediaId: target.mediaId, episode: target.episode };
}

/** Where "Play" on a series should start for this user. */
export async function firstToPlay(user: User, seriesId: string): Promise<string | null> {
  const jf = await asUser(user);
  const q = `userId=${jf.userId}&Limit=1&EnableImages=false`;
  const resume = await jf
    .call<{ Items: JfItem[] }>(`/UserItems/Resume?${q}&ParentId=${seriesId}&IncludeItemTypes=Episode`)
    .catch(() => ({ Items: [] as JfItem[] }));
  if (resume.Items[0]) return resume.Items[0].Id;
  const nextUp = await jf.call<{ Items: JfItem[] }>(`/Shows/NextUp?${q}&SeriesId=${seriesId}`).catch(() => ({ Items: [] as JfItem[] }));
  if (nextUp.Items[0]) return nextUp.Items[0].Id;
  const first = await jf.call<{ Items: JfItem[] }>(
    `/Items?${q}&ParentId=${seriesId}&Recursive=true&IncludeItemTypes=Episode&SortBy=ParentIndexNumber,IndexNumber&IsMissing=false`,
  );
  return first.Items.find((e) => (e.ParentIndexNumber ?? 1) > 0)?.Id ?? first.Items[0]?.Id ?? null;
}

/**
 * Where this user left off, for a Play button pointing at `href` (a /watch link): the half-watched film or episode
 * ("Resume S2 E5 · 12 min left", or `name` in place of "S2 E5") or, for a series, the next episode. Null when there's nothing to resume.
 */
export async function resumeHint(user: User, href: string | null, name?: string): Promise<string | null> {
  const m = href?.match(/^\/watch\/(series\/)?([0-9a-f-]{32,36})$/i);
  if (!m || !canPlay(user)) return null;
  try {
    const jf = await asUser(user);
    const q = `userId=${jf.userId}&Limit=1&EnableImages=false`;
    let item: JfItem | undefined;
    if (m[1]) {
      item = (await jf.call<{ Items: JfItem[] }>(`/UserItems/Resume?${q}&ParentId=${m[2]}&IncludeItemTypes=Episode`)).Items[0];
      if (!item) {
        const next = (await jf.call<{ Items: JfItem[] }>(`/Shows/NextUp?${q}&SeriesId=${m[2]}&DisableFirstEpisode=true`)).Items[0];
        return next ? `Play ${epLabel(next)}` : null;
      }
    } else item = await jf.call<JfItem>(`/Items/${m[2]}?userId=${jf.userId}`);
    const at = item.UserData?.Played ? 0 : (item.UserData?.PlaybackPositionTicks ?? 0);
    // Same 10 s threshold the player uses before it resumes rather than starting over.
    if (at < 10 * TICKS || !item.RunTimeTicks) return null;
    const left = Math.max(1, Math.round((item.RunTimeTicks - at) / TICKS / 60));
    const time = left >= 60 ? `${Math.floor(left / 60)} h${left % 60 ? ` ${left % 60} min` : ""}` : `${left} min`;
    return `Resume${name ? ` ${name}` : item.Type === "Episode" ? ` ${epLabel(item)}` : ""} · ${time} left`;
  } catch {
    return null;
  }
}

/** For the "Sign in with Jellyfin to watch" prompts. */
export const canPlay = (user: User) => !!user.jellyfinUserId && !!jellyfinToken(user);
export type { JellyfinCredentials };
