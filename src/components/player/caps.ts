import type { BrowserCaps } from "@/lib/playbackTypes";

/** Ask the browser what it can decode, so Jellyfin only transcodes what it has to. */
export function detectCaps(): BrowserCaps {
  const v = document.createElement("video");
  const can = (type: string) => v.canPlayType(type) !== "";
  const mse = (type: string) => typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(type);
  const either = (type: string) => can(type) || mse(type);
  return {
    video: {
      h264: either('video/mp4; codecs="avc1.640029"'),
      hevc: either('video/mp4; codecs="hvc1.1.6.L120.90"') || either('video/mp4; codecs="hev1.1.6.L120.90"'),
      av1: either('video/mp4; codecs="av01.0.08M.08"'),
      vp9: either('video/webm; codecs="vp9"'),
    },
    audio: {
      aac: either('audio/mp4; codecs="mp4a.40.2"'),
      mp3: can("audio/mpeg"),
      opus: either('audio/webm; codecs="opus"') || either('audio/mp4; codecs="opus"'),
      flac: can("audio/flac") || either('audio/mp4; codecs="flac"'),
      ac3: either('audio/mp4; codecs="ac-3"'),
      eac3: either('audio/mp4; codecs="ec-3"'),
    },
    // Chromium and recent Firefox play Matroska with codecs they know even when canPlayType is shy about saying so.
    mkv: can("video/x-matroska") || can('video/webm; codecs="avc1.640029"') || /Chrome\//.test(navigator.userAgent),
    nativeHls: can("application/vnd.apple.mpegurl") && !/Chrome\/|Firefox\//.test(navigator.userAgent),
    maxChannels: 2,
  };
}
