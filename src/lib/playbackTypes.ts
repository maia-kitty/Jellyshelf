/** Shapes shared by the player (browser) and the playback API. No server imports here. */

/** What the browser says it can play, so Jellyfin can pick direct play, remux or transcode. */
export interface BrowserCaps {
  video: { h264: boolean; hevc: boolean; av1: boolean; vp9: boolean };
  audio: { aac: boolean; mp3: boolean; opus: boolean; flac: boolean; ac3: boolean; eac3: boolean };
  mkv: boolean;
  /** Native HLS (Safari); elsewhere hls.js does it over MSE. */
  nativeHls: boolean;
  maxChannels: number;
}

export interface PlayRequest {
  caps: BrowserCaps;
  audioIndex?: number;
  subtitleIndex?: number;
  /** bits/s; omit for "Auto". */
  maxBitrate?: number;
  /** Ask for a remux/transcode even if direct play looked possible (the browser couldn't play the file after all). */
  noDirectPlay?: boolean;
}

export interface AudioTrack {
  index: number;
  label: string;
  language: string | null;
  isDefault: boolean;
}

export interface SubtitleTrack {
  index: number;
  label: string;
  language: string | null;
  isDefault: boolean;
  isForced: boolean;
  /** "ass": rendered by JASSUB from the original file; "vtt": a plain <track>; "burn": drawn into the video by Jellyfin. */
  kind: "ass" | "vtt" | "burn";
  /** Relay URL for ass/vtt. */
  url: string | null;
}

export interface PlaySource {
  itemId: string;
  mediaSourceId: string;
  playSessionId: string;
  /** "direct": the file as it is; "hls": Jellyfin remuxes or transcodes into HLS. */
  mode: "direct" | "hls";
  /** What Jellyfin is doing, for the info line and for reporting. */
  playMethod: "DirectPlay" | "DirectStream" | "Transcode";
  url: string;
  /** Why it isn't direct play, when Jellyfin says. */
  transcodeReasons: string[];
  runTimeTicks: number;
  audio: AudioTrack[];
  subtitles: SubtitleTrack[];
  audioIndex: number | null;
  subtitleIndex: number | null;
  /** Fonts embedded in the file (for styled subtitles). */
  fonts: string[];
  video: { codec: string | null; width: number | null; height: number | null; bitrate: number | null };
}

export interface Segment {
  type: "Intro" | "Outro" | "Recap" | "Preview" | "Commercial";
  start: number;
  end: number;
}

export interface Trickplay {
  /** {index} in the URL is the tile sheet number. */
  url: string;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  count: number;
  /** ms between thumbnails */
  interval: number;
}

export interface WatchMeta {
  itemId: string;
  title: string;
  /** "Frieren · S1 E5" */
  subtitle: string | null;
  backdrop: string | null;
  /** Where to go when you close the player. */
  backHref: string;
  /** Seconds; 0 when starting fresh. */
  resumeAt: number;
  runTime: number;
  next: { id: string; title: string; label: string; thumb: string | null } | null;
  prev: { id: string; label: string } | null;
  segments: Segment[];
  trickplay: Trickplay | null;
  /** Whether finishing this will move AniList progress, and to which entry/episode. */
  anilist: { mediaId: number; episode: number; title: string; episodes: number | null } | null;
  /** The last episode of an AniList entry (or an anime film) you haven't rated yet: the player offers to rate it. */
  finale: { anilistId: number; title: string; canPush: boolean } | null;
}

export type ReportEvent = "start" | "progress" | "stop";

export interface PlayReport {
  event: ReportEvent;
  itemId: string;
  mediaSourceId: string;
  playSessionId: string;
  playMethod: PlaySource["playMethod"];
  /** seconds */
  position: number;
  /** seconds */
  duration: number;
  paused: boolean;
  audioIndex: number | null;
  subtitleIndex: number | null;
}
