"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { BrowserCaps, PlayReport, PlaySource, SubtitleTrack, WatchMeta } from "@/lib/playbackTypes";
import { detectCaps } from "./caps";
import { SeekBar } from "./SeekBar";
import { Icon } from "./icons";

type HlsLike = { destroy(): void; loadSource(u: string): void; attachMedia(v: HTMLVideoElement): void; on(ev: string, cb: (e: string, d: { fatal?: boolean }) => void): void };
type JassubLike = { destroy(): void | Promise<void> };

const QUALITIES: { label: string; bitrate?: number }[] = [
  { label: "Auto" },
  { label: "20 Mbps", bitrate: 20_000_000 },
  { label: "10 Mbps", bitrate: 10_000_000 },
  { label: "6 Mbps", bitrate: 6_000_000 },
  { label: "3 Mbps", bitrate: 3_000_000 },
  { label: "1.5 Mbps", bitrate: 1_500_000 },
];

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(`player:${k}`);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(`player:${k}`, v);
    } catch {}
  },
};

interface Choice {
  audioIndex?: number;
  subtitleIndex?: number;
  maxBitrate?: number;
  noDirectPlay?: boolean;
}

/** The full-screen player for one Jellyfin item. Re-mounted (keyed) per item. */
export function Player({ meta }: { meta: WatchMeta }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<HlsLike | null>(null);
  const jassub = useRef<JassubLike | null>(null);
  const caps = useRef<BrowserCaps | null>(null);
  const source = useRef<PlaySource | null>(null);
  const started = useRef(false);

  const [src, setSrc] = useState<PlaySource | null>(null);
  const [choice, setChoice] = useState<Choice>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(meta.runTime);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState<null | "subs" | "audio" | "quality">(null);
  const [subIndex, setSubIndex] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [upNext, setUpNext] = useState<null | number>(null); // seconds left on the countdown
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  const [ripple, setRipple] = useState<null | { side: "left" | "right"; key: number }>(null);

  const say = useCallback((t: string) => {
    setToast(t);
    window.setTimeout(() => setToast((x) => (x === t ? null : x)), 3500);
  }, []);

  // ---------- reporting ----------
  const reportBody = useCallback(
    (event: PlayReport["event"]): PlayReport | null => {
      const v = video.current;
      const s = source.current;
      if (!v || !s) return null;
      return {
        event,
        itemId: s.itemId,
        mediaSourceId: s.mediaSourceId,
        playSessionId: s.playSessionId,
        playMethod: s.playMethod,
        position: v.currentTime || 0,
        duration: v.duration || meta.runTime,
        paused: v.paused,
        audioIndex: s.audioIndex,
        subtitleIndex: subIndexRef.current,
      };
    },
    [meta.runTime],
  );
  const subIndexRef = useRef<number | null>(null);
  subIndexRef.current = subIndex;

  const report = useCallback(
    async (event: PlayReport["event"]) => {
      const body = reportBody(event);
      if (!body) return;
      const res = await fetch("/api/play/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: event === "stop" }).catch(
        () => null,
      );
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      if (j?.anilist && meta.anilist) say(`AniList: ${meta.anilist.title} — episode ${j.anilist.episode} watched`);
    },
    [reportBody, meta.anilist, say],
  );

  // Progress every 10 s while playing; stop when leaving (including closing the tab).
  useEffect(() => {
    const iv = window.setInterval(() => {
      if (started.current && video.current && !video.current.paused) report("progress");
    }, 10_000);
    const leave = () => {
      const body = started.current && reportBody("stop");
      if (body) navigator.sendBeacon("/api/play/report", JSON.stringify(body));
      started.current = false;
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("pagehide", leave);
      if (started.current) report("stop");
      started.current = false;
    };
  }, [report, reportBody]);

  // ---------- loading a stream ----------
  const teardown = useCallback(() => {
    hls.current?.destroy();
    hls.current = null;
    jassub.current?.destroy();
    jassub.current = null;
  }, []);

  const load = useCallback(
    async (c: Choice, at: number) => {
      setLoading(true);
      setError("");
      caps.current ??= detectCaps();
      const res = await fetch(`/api/play/${meta.itemId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caps: caps.current, ...c }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoading(false);
        setError(j.error ?? `Couldn't start playback (${res.status})`);
        return;
      }
      const s = j as PlaySource;
      // Switching streams: tell Jellyfin the old session is over (and its transcode can stop).
      if (started.current && source.current && source.current.playSessionId !== s.playSessionId) {
        await report("stop");
        started.current = false;
      }
      teardown();
      source.current = s;
      setSrc(s);
      const v = video.current!;
      if (s.mode === "hls" && !caps.current.nativeHls) {
        const { default: Hls } = await import("hls.js");
        const h = new Hls({ startPosition: at, maxBufferLength: 30 }) as unknown as HlsLike;
        h.on("hlsError", (_e, d) => {
          if (d.fatal) setError("The stream stopped. Try again, or pick a lower quality.");
        });
        h.loadSource(s.url);
        h.attachMedia(v);
        hls.current = h;
      } else {
        v.src = s.url;
        if (at) v.currentTime = at;
      }
      v.play().catch(() => setPlaying(false));
    },
    [meta.itemId, report, teardown],
  );

  // First load: remembered languages, resume point.
  useEffect(() => {
    const v = video.current!;
    const vol = Number(store.get("volume") ?? "1");
    v.volume = Number.isFinite(vol) ? vol : 1;
    v.muted = store.get("muted") === "1";
    setVolume(v.volume);
    setMuted(v.muted);
    load({}, meta.resumeAt);
    if (meta.resumeAt) say(`Resuming from ${fmt(meta.resumeAt)}`);
    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once tracks are known: pick the remembered subtitle language (or the file's default).
  const pickedInitialSubs = useRef(false);
  useEffect(() => {
    if (!src || pickedInitialSubs.current) return;
    pickedInitialSubs.current = true;
    const want = store.get("subLang");
    const byLang = want === "off" ? null : want ? src.subtitles.find((s) => s.language === want && !s.isForced) : undefined;
    const chosen = byLang === null ? null : (byLang ?? src.subtitles.find((s) => s.index === src.subtitleIndex) ?? src.subtitles.find((s) => s.isDefault) ?? null);
    // Prefer the styled track when the default is a plain one for the same language.
    const styled = chosen && chosen.kind !== "ass" ? src.subtitles.find((s) => s.kind === "ass" && s.language === chosen.language) : undefined;
    setSubIndex((styled ?? chosen)?.index ?? null);
  }, [src]);

  // ---------- subtitles ----------
  const sub = src?.subtitles.find((s) => s.index === subIndex) ?? null;
  useEffect(() => {
    jassub.current?.destroy();
    jassub.current = null;
    const v = video.current;
    if (!v || !src || !sub) return;
    if (sub.kind === "burn") {
      // Drawn in by the server: that's a different stream.
      if (src.subtitleIndex !== sub.index) {
        const c = { ...choice, subtitleIndex: sub.index };
        setChoice(c);
        load(c, v.currentTime);
      }
      return;
    }
    if (src.subtitleIndex !== null && src.subtitles.find((s) => s.index === src.subtitleIndex)?.kind === "burn") {
      // Leaving a burned-in track: back to a clean stream.
      const c = { ...choice, subtitleIndex: -1 };
      setChoice(c);
      load(c, v.currentTime);
      return;
    }
    if (sub.kind === "ass" && sub.url) {
      let cancelled = false;
      import("jassub").then(({ default: JASSUB }) => {
        if (cancelled) return;
        jassub.current = new JASSUB({ video: v, subUrl: sub.url!, fonts: src.fonts, queryFonts: false }) as unknown as JassubLike;
      });
      return () => {
        cancelled = true;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub?.index, src?.playSessionId]);

  const chooseSub = (t: SubtitleTrack | null) => {
    setSubIndex(t?.index ?? null);
    store.set("subLang", t ? (t.language ?? "") : "off");
    setMenu(null);
  };
  const chooseAudio = (index: number) => {
    const t = src?.audio.find((a) => a.index === index);
    if (t?.language) store.set("audioLang", t.language);
    const c = { ...choice, audioIndex: index };
    setChoice(c);
    setMenu(null);
    load(c, video.current?.currentTime ?? 0);
  };
  const chooseQuality = (bitrate?: number) => {
    const c = { ...choice, maxBitrate: bitrate };
    setChoice(c);
    setMenu(null);
    load(c, video.current?.currentTime ?? 0);
  };

  // ---------- video events ----------
  const onError = () => {
    const v = video.current!;
    // The browser couldn't play the file as it is after all: let Jellyfin remux/transcode it.
    if (source.current?.mode === "direct" && !choice.noDirectPlay) {
      const c = { ...choice, noDirectPlay: true };
      setChoice(c);
      load(c, v.currentTime || meta.resumeAt);
      return;
    }
    setError("This video can't be played here.");
  };

  // ---------- controls ----------
  const hideTimer = useRef<number | undefined>(undefined);
  const poke = useCallback(() => {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (video.current && !video.current.paused) {
        setControls(false);
        setMenu(null);
      }
    }, 3000);
  }, []);

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    poke();
  }, [poke]);
  const seekTo = useCallback(
    (t: number) => {
      const v = video.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(t, (v.duration || duration) - 0.5));
      setTime(v.currentTime);
      poke();
    },
    [duration, poke],
  );
  const seekBy = useCallback((d: number) => video.current && seekTo(video.current.currentTime + d), [seekTo]);
  const setVol = (v: number) => {
    const el = video.current!;
    el.volume = Math.max(0, Math.min(1, v));
    el.muted = el.volume === 0;
    store.set("volume", String(el.volume));
    store.set("muted", el.muted ? "1" : "0");
  };
  const toggleMute = () => {
    const el = video.current!;
    el.muted = !el.muted;
    store.set("muted", el.muted ? "1" : "0");
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen().catch(() => {});
  };
  const pip = () => {
    const v = video.current as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> };
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else v.requestPictureInPicture?.().catch(() => {});
  };
  const goNext = useCallback(() => {
    if (meta.next) router.replace(`/watch/${meta.next.id}`);
  }, [meta.next, router]);

  useEffect(() => {
    const fs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fs);
    return () => document.removeEventListener("fullscreenchange", fs);
  }, []);

  // Keyboard: space/k play, ←/→ 5 s, j/l 10 s, ↑/↓ volume, f fullscreen, m mute, c subtitles, n next.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
      const v = video.current;
      if (!v) return;
      const k = e.key.toLowerCase();
      const map: Record<string, () => void> = {
        " ": toggle,
        k: toggle,
        arrowleft: () => seekBy(-5),
        arrowright: () => seekBy(5),
        j: () => seekBy(-10),
        l: () => seekBy(10),
        arrowup: () => setVol(v.volume + 0.05),
        arrowdown: () => setVol(v.volume - 0.05),
        f: toggleFullscreen,
        m: toggleMute,
        n: goNext,
        c: () => {
          const list = source.current?.subtitles ?? [];
          const i = list.findIndex((s) => s.index === subIndexRef.current);
          chooseSub(i + 1 < list.length ? list[i + 1] : null);
        },
      };
      if (map[k]) {
        e.preventDefault();
        map[k]();
        poke();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggle, seekBy, goNext, poke]);

  // Taps: one toggles the controls (or play on desktop), a double tap on either side seeks 10 s.
  const lastTap = useRef<{ t: number; x: number } | null>(null);
  const onSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const now = Date.now();
    const touch = (e.nativeEvent as PointerEvent).pointerType === "touch";
    if (lastTap.current && now - lastTap.current.t < 300 && Math.abs(lastTap.current.x - x) < 0.25) {
      lastTap.current = null;
      if (x < 0.4) {
        seekBy(-10);
        setRipple({ side: "left", key: now });
      } else if (x > 0.6) {
        seekBy(10);
        setRipple({ side: "right", key: now });
      } else toggleFullscreen();
      return;
    }
    lastTap.current = { t: now, x };
    window.setTimeout(() => {
      if (lastTap.current?.t !== now) return;
      if (touch) {
        if (controls && !menu) setControls(false);
        else poke();
      } else toggle();
    }, touch ? 280 : 200);
  };

  // ---------- segments & up next ----------
  const segment = meta.segments.find((s) => time >= s.start && time < s.end - 1 && (s.type === "Intro" || s.type === "Recap" || s.type === "Preview"));
  const outro = meta.segments.find((s) => s.type === "Outro");
  const nearEnd = duration > 0 && (outro ? time >= outro.start : duration - time <= 25);
  useEffect(() => {
    if (!meta.next || upNextDismissed || !nearEnd || !playing) return;
    setUpNext((n) => (n === null ? Math.max(5, Math.min(15, Math.round(duration - time))) : n));
  }, [nearEnd, playing, meta.next, upNextDismissed, duration, time]);
  useEffect(() => {
    if (upNext === null) return;
    if (upNext <= 0) {
      goNext();
      return;
    }
    const t = window.setTimeout(() => setUpNext((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [upNext, goNext]);

  const trickIndex = useMemo(() => meta.trickplay, [meta.trickplay]);

  return (
    <div
      ref={root}
      className={clsx("player-root fixed inset-0 z-[60] select-none bg-black text-white", !controls && "cursor-none")}
      onMouseMove={poke}
    >
      {meta.backdrop && loading && !error && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meta.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-sm" />
      )}
      <video
        ref={video}
        className="absolute inset-0 h-full w-full"
        playsInline
        onPlaying={() => {
          setLoading(false);
          setPlaying(true);
          if (!started.current) {
            started.current = true;
            report("start");
          } else report("progress");
          poke();
        }}
        onPause={() => {
          setPlaying(false);
          setControls(true);
          if (started.current) report("progress");
        }}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setTime(v.currentTime);
          if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
        }}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onEnded={() => {
          report("stop");
          started.current = false;
          if (meta.next && !upNextDismissed) goNext();
        }}
        onError={onError}
      >
        {sub?.kind === "vtt" && sub.url && <track key={sub.index} kind="subtitles" src={sub.url} srcLang={sub.language ?? undefined} label={sub.label} default />}
      </video>

      {/* Tap/click surface */}
      <div className="absolute inset-0" onClick={onSurfaceClick} />

      {ripple && (
        <div
          key={ripple.key}
          className={clsx("seek-ripple pointer-events-none absolute top-1/2 flex h-28 w-28 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-sm font-semibold", ripple.side === "left" ? "left-[12%]" : "right-[12%]")}
          onAnimationEnd={() => setRipple(null)}
        >
          {ripple.side === "left" ? "« 10 s" : "10 s »"}
        </div>
      )}

      {(loading || error) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4">
          {error ? (
            <div className="pointer-events-auto max-w-sm rounded-2xl bg-black/70 p-5 text-center backdrop-blur">
              <p className="mb-4 text-sm">{error}</p>
              <div className="flex justify-center gap-2">
                <button className="btn-primary" onClick={() => load(choice, video.current?.currentTime ?? meta.resumeAt)}>
                  Try again
                </button>
                <Link className="btn-ghost" href={meta.backHref}>
                  Back
                </Link>
              </div>
            </div>
          ) : (
            <span className="player-spinner h-12 w-12 rounded-full border-4 border-white/20 border-t-white" />
          )}
        </div>
      )}

      {/* Top bar */}
      <div className={clsx("absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] transition-opacity duration-300 sm:px-6", controls ? "opacity-100" : "pointer-events-none opacity-0")}>
        <Link href={meta.backHref} className="rounded-full p-2 hover:bg-white/10" aria-label="Back">
          <Icon name="back" />
        </Link>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold sm:text-lg">{meta.title}</div>
          {meta.subtitle && <div className="truncate text-xs text-white/70 sm:text-sm">{meta.subtitle}</div>}
        </div>
        {src && (
          <span className="ml-auto hidden rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-white/70 sm:inline" title={src.transcodeReasons.join(", ") || undefined}>
            {src.playMethod === "DirectPlay" ? "Direct play" : src.playMethod === "DirectStream" ? "Direct stream" : "Transcoding"}
            {src.video.height ? ` · ${src.video.height}p` : ""}
          </span>
        )}
      </div>

      {/* Contextual: skip intro, up next */}
      {segment && controls !== undefined && (
        <button
          onClick={() => seekTo(segment.end)}
          className="absolute bottom-28 right-4 rounded-xl border border-white/30 bg-black/60 px-4 py-2.5 text-sm font-semibold backdrop-blur transition hover:bg-white hover:text-black sm:right-8"
        >
          Skip {segment.type === "Recap" ? "recap" : segment.type === "Preview" ? "preview" : "intro"} »
        </button>
      )}
      {upNext !== null && meta.next && (
        <div className="absolute bottom-28 right-4 flex w-80 max-w-[calc(100%-2rem)] gap-3 overflow-hidden rounded-2xl border border-white/15 bg-black/75 p-3 backdrop-blur sm:right-8">
          {meta.next.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta.next.thumb} alt="" className="h-16 w-28 shrink-0 rounded-lg bg-white/10 object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-white/60">Up next · {meta.next.label}</div>
            <div className="truncate text-sm font-semibold">{meta.next.title}</div>
            <div className="mt-2 flex gap-2">
              <button className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-black" onClick={goNext}>
                Play in {upNext}
              </button>
              <button
                className="rounded-lg bg-white/10 px-3 py-1 text-xs"
                onClick={() => {
                  setUpNext(null);
                  setUpNextDismissed(true);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm backdrop-blur">{toast}</div>
      )}

      {/* Bottom controls */}
      <div
        className={clsx(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-16 transition-opacity duration-300 sm:px-6",
          controls ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <SeekBar time={time} duration={duration} buffered={buffered} segments={meta.segments} trickplay={trickIndex} onSeek={seekTo} onScrub={poke} />
        <div className="mt-1 flex items-center gap-1 sm:gap-2">
          <Btn label={playing ? "Pause (k)" : "Play (k)"} onClick={toggle}>
            <Icon name={playing ? "pause" : "play"} />
          </Btn>
          <Btn label="Back 10 s (j)" onClick={() => seekBy(-10)}>
            <Icon name="rewind" />
          </Btn>
          <Btn label="Forward 10 s (l)" onClick={() => seekBy(10)}>
            <Icon name="forward" />
          </Btn>
          {meta.next && (
            <Btn label={`Next: ${meta.next.label} (n)`} onClick={goNext}>
              <Icon name="next" />
            </Btn>
          )}
          <div className="group/vol hidden items-center sm:flex">
            <Btn label="Mute (m)" onClick={toggleMute}>
              <Icon name={muted || volume === 0 ? "muted" : "volume"} />
            </Btn>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => setVol(Number(e.target.value))}
              className="player-range w-0 opacity-0 transition-all duration-300 group-hover/vol:w-24 group-hover/vol:opacity-100"
              aria-label="Volume"
            />
          </div>
          <span className="ml-1 text-xs tabular-nums text-white/80 sm:text-sm">
            {fmt(time)} <span className="text-white/50">/ {fmt(duration)}</span>
          </span>

          <div className="relative ml-auto flex items-center gap-1 sm:gap-2">
            {src && src.subtitles.length > 0 && (
              <Btn label="Subtitles (c)" active={menu === "subs"} onClick={() => setMenu(menu === "subs" ? null : "subs")}>
                <Icon name="subs" />
              </Btn>
            )}
            {src && src.audio.length > 1 && (
              <Btn label="Audio" active={menu === "audio"} onClick={() => setMenu(menu === "audio" ? null : "audio")}>
                <Icon name="audio" />
              </Btn>
            )}
            <Btn label="Quality" active={menu === "quality"} onClick={() => setMenu(menu === "quality" ? null : "quality")}>
              <Icon name="gear" />
            </Btn>
            <Btn label="Picture in picture" onClick={pip} className="hidden sm:inline-flex">
              <Icon name="pip" />
            </Btn>
            <Btn label="Fullscreen (f)" onClick={toggleFullscreen}>
              <Icon name={fullscreen ? "unfullscreen" : "fullscreen"} />
            </Btn>

            {menu && src && (
              <div className="menu-pop absolute bottom-12 right-0 max-h-[60vh] w-64 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900/95 p-1.5 shadow-2xl backdrop-blur">
                {menu === "subs" && (
                  <>
                    <MenuItem on={subIndex === null} onClick={() => chooseSub(null)}>
                      Off
                    </MenuItem>
                    {src.subtitles.map((t) => (
                      <MenuItem key={t.index} on={subIndex === t.index} onClick={() => chooseSub(t)} hint={t.kind === "ass" ? "styled" : t.kind === "burn" ? "burned in" : undefined}>
                        {t.label}
                        {t.isForced ? " (forced)" : ""}
                      </MenuItem>
                    ))}
                  </>
                )}
                {menu === "audio" &&
                  src.audio.map((t) => (
                    <MenuItem key={t.index} on={src.audioIndex === t.index} onClick={() => chooseAudio(t.index)}>
                      {t.label}
                    </MenuItem>
                  ))}
                {menu === "quality" &&
                  QUALITIES.map((q) => (
                    <MenuItem key={q.label} on={choice.maxBitrate === q.bitrate} onClick={() => chooseQuality(q.bitrate)} hint={!q.bitrate ? "original when possible" : undefined}>
                      {q.label}
                    </MenuItem>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Btn({ label, onClick, children, active, className }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx("inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/15 active:scale-90", active && "bg-white/15", className)}
    >
      {children}
    </button>
  );
}

function MenuItem({ on, onClick, children, hint }: { on: boolean; onClick: () => void; children: React.ReactNode; hint?: string }) {
  return (
    <button onClick={onClick} className={clsx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10", on && "text-[#00a4dc]")}>
      <span className="w-4 shrink-0">{on ? "✓" : ""}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[11px] text-white/50">{hint}</span>}
    </button>
  );
}
