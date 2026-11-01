"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { BrowserCaps, PlayReport, PlaySource, SubtitleTrack, WatchMeta } from "@/lib/playbackTypes";
import type { HlsConfig } from "hls.js";
import { detectCaps } from "./caps";
import { pickSubtitle } from "@/lib/subtitlePick";
import { SeekBar } from "./SeekBar";
import { Icon } from "./icons";
import { JarLoader } from "../AppIcon";
import { sized } from "@/lib/img";
import { Modal } from "../Modal";
import { RatingForm } from "../RatingForm";
import { appImmersive } from "@/lib/app";

type HlsLike = {
  destroy(): void;
  loadSource(u: string): void;
  attachMedia(v: HTMLVideoElement): void;
  on(ev: string, cb: (e: string, d: { fatal?: boolean }) => void): void;
  stopLoad(): void;
  startLoad(at: number): void;
};
type JassubLike = { destroy(): void | Promise<void> };

const QUALITIES: { label: string; bitrate?: number }[] = [
  { label: "Auto" },
  { label: "20 Mbps", bitrate: 20_000_000 },
  { label: "10 Mbps", bitrate: 10_000_000 },
  { label: "6 Mbps", bitrate: 6_000_000 },
  { label: "3 Mbps", bitrate: 3_000_000 },
  { label: "1.5 Mbps", bitrate: 1_500_000 },
];

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

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
  // The opening splash (backdrop, title, jar): up until the picture starts, then fades out and is removed.
  const [intro, setIntro] = useState<"on" | "out" | "gone">("on");
  const endIntro = useCallback(() => setIntro((i) => (i === "on" ? "out" : i)), []);
  // Fast servers start in a blink, which made the splash a flash: hold the first play() until then (it buffers meanwhile).
  const splashUntil = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(meta.runTime);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState<null | "subs" | "audio" | "quality" | "speed">(null);
  const [speed, setSpeed] = useState(1);
  // The volume slider, held open for a moment after ↑/↓ so you can see it move.
  const [volPeek, setVolPeek] = useState(false);
  const volPeekTimer = useRef<number | undefined>(undefined);
  const [subIndex, setSubIndex] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [upNext, setUpNext] = useState<null | number>(null); // seconds left on the countdown
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  // Last episode of something unrated: "offer" shows the card, "open" the rating form.
  const [rate, setRate] = useState<null | "offer" | "open" | "dismissed">(null);
  // As it was when the player opened: saving refreshes `meta`, where it's then null (rated), and the dialog would vanish.
  const [finale] = useState(meta.finale);
  const offeringRate = !!finale && rate !== "dismissed";
  const [ripple, setRipple] = useState<null | { side: "left" | "right"; key: number }>(null);

  const say = useCallback((t: string) => {
    setToast(t);
    window.setTimeout(() => setToast((x) => (x === t ? null : x)), 3500);
  }, []);

  // Where playback should be while a stream is still loading: the resume point, the spot a switch left off, or a seek
  // made meanwhile. Until the video catches up its own position reads 0, so reloads, seeks and reports use this.
  const pending = useRef<number | null>(null);
  const here = useCallback(() => pending.current ?? video.current?.currentTime ?? 0, []);

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
        position: here(),
        duration: v.duration || meta.runTime,
        paused: v.paused,
        audioIndex: s.audioIndex,
        subtitleIndex: subIndexRef.current,
      };
    },
    [meta.runTime, here],
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
      // Drops the browser's copies of pages seen before, so going back shows the new progress.
      if (j?.anilist) router.refresh();
    },
    [reportBody, meta.anilist, say, router],
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
      pending.current = at;
      const v = video.current!;
      if (s.mode === "hls" && !caps.current.nativeHls) {
        const [{ default: Hls }, { alignedLoader }] = await Promise.all([import("hls.js"), import("./alignedLoader")]);
        const h = new Hls({ startPosition: at, maxBufferLength: 30, fLoader: alignedLoader(Hls) as unknown as HlsConfig["fLoader"] }) as unknown as HlsLike;
        h.on("hlsError", (_e, d) => {
          if (d.fatal) setError("The stream stopped. Try again, or pick a lower quality.");
        });
        h.loadSource(s.url);
        h.attachMedia(v);
        hls.current = h;
      } else {
        // The start position is applied on loadedmetadata (Safari ignores one set before then).
        v.src = s.url;
      }
      const wait = splashUntil.current - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      v.play().catch((e) => {
        setPlaying(false);
        // Autoplay blocked: nothing will start on its own, so get the splash out of the way of the play button.
        if ((e as Error).name === "NotAllowedError") endIntro();
      });
    },
    [meta.itemId, report, teardown, endIntro],
  );

  // First load: remembered languages, resume point.
  useEffect(() => {
    const v = video.current!;
    const vol = Number(store.get("volume") ?? "1");
    v.volume = Number.isFinite(vol) ? vol : 1;
    v.muted = store.get("muted") === "1";
    setVolume(v.volume);
    setMuted(v.muted);
    applySpeed(Number(store.get("speed")) || 1);
    splashUntil.current = Date.now() + 1200;
    load({}, meta.resumeAt);
    if (meta.resumeAt) say(`Resuming from ${fmt(meta.resumeAt)}`);
    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once tracks are known: the subtitles you last picked (language, and SDH or not), or the file's default.
  const pickedInitialSubs = useRef(false);
  useEffect(() => {
    if (!src || pickedInitialSubs.current) return;
    pickedInitialSubs.current = true;
    setSubIndex(pickSubtitle(src.subtitles, { lang: store.get("subLang"), hi: store.get("subHi") === "1" }, src.subtitleIndex)?.index ?? null);
  }, [src]);

  // ---------- subtitles ----------
  const sub = src?.subtitles.find((s) => s.index === subIndex) ?? null;
  useEffect(() => {
    jassub.current?.destroy();
    jassub.current = null;
    const v = video.current;
    if (!v || !src) return;
    if (sub?.kind === "burn") {
      // Drawn in by the server: that's a different stream.
      if (src.subtitleIndex !== sub.index) {
        const c = { ...choice, subtitleIndex: sub.index };
        setChoice(c);
        load(c, here());
      }
      return;
    }
    if (src.subtitleIndex !== null && src.subtitles.find((s) => s.index === src.subtitleIndex)?.kind === "burn") {
      // Leaving a burned-in track (for another, or for Off): back to a clean stream.
      const c = { ...choice, subtitleIndex: -1 };
      setChoice(c);
      load(c, here());
      return;
    }
    if (sub?.kind === "ass" && sub.url) {
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
    if (t) store.set("subHi", t.hi ? "1" : "0");
    setMenu(null);
  };
  const chooseAudio = (index: number) => {
    const t = src?.audio.find((a) => a.index === index);
    if (t?.language) store.set("audioLang", t.language);
    const c = { ...choice, audioIndex: index };
    setChoice(c);
    setMenu(null);
    load(c, here());
  };
  const chooseQuality = (bitrate?: number) => {
    const c = { ...choice, maxBitrate: bitrate };
    setChoice(c);
    setMenu(null);
    load(c, here());
  };

  const applySpeed = (x: number) => {
    const v = video.current!;
    // defaultPlaybackRate too: switching streams (audio, quality) reloads the video, which resets the rate to it.
    v.playbackRate = v.defaultPlaybackRate = x;
    setSpeed(x);
    store.set("speed", String(x));
  };
  const stepSpeed = (d: number) => {
    const x = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + d))] ?? 1;
    applySpeed(x);
    say(`Speed ${x}×`);
  };

  // ---------- video events ----------
  const onError = () => {
    // The browser couldn't play the file as it is after all: let Jellyfin remux/transcode it.
    if (source.current?.mode === "direct" && !choice.noDirectPlay) {
      const c = { ...choice, noDirectPlay: true };
      setChoice(c);
      load(c, here());
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
      const to = Math.max(0, Math.min(t, (v.duration || duration || Infinity) - 0.5));
      if (pending.current !== null) pending.current = to;
      setTime(to);
      if (v.readyState >= 1) v.currentTime = to;
      // Still loading, so there's nothing to seek in yet (and seeking hls.js mid-setup can wedge it): it starts from
      // here instead. hls.js is told directly; anything else is moved here once it has loaded (onLoadedMetadata).
      else if (hls.current) {
        hls.current.stopLoad();
        hls.current.startLoad(to);
      }
      poke();
    },
    [duration, poke],
  );
  const seekBy = useCallback((d: number) => seekTo(here() + d), [seekTo, here]);
  const setVol = (v: number) => {
    const el = video.current!;
    el.volume = Math.max(0, Math.min(1, v));
    el.muted = el.volume === 0;
    store.set("volume", String(el.volume));
    store.set("muted", el.muted ? "1" : "0");
  };
  const keyVol = (v: number) => {
    setVol(v);
    setVolPeek(true);
    window.clearTimeout(volPeekTimer.current);
    volPeekTimer.current = window.setTimeout(() => setVolPeek(false), 1500);
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
    const fs = () => {
      setFullscreen(!!document.fullscreenElement);
      // Phone browsers only let a page rotate itself while it's full screen: going full screen turns it sideways.
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (document.fullscreenElement && matchMedia("(pointer: coarse)").matches) o.lock?.("landscape").catch(() => {});
      else if (!document.fullscreenElement) o.unlock?.();
    };
    document.addEventListener("fullscreenchange", fs);
    return () => {
      document.removeEventListener("fullscreenchange", fs);
      // Leaving the player: the app goes back to following the phone.
      appImmersive(false);
    };
  }, []);

  // Keyboard: space/k play, ←/→ 5 s, j/l 10 s, ↑/↓ volume, f fullscreen, m mute, c subtitles, n next, </> speed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea, [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const v = video.current;
      if (!v) return;
      // On a Cyrillic or Greek layout "k" types "л": go by the physical key for letters the layout doesn't have.
      const k = /^Key[A-Z]$/.test(e.code) && !/^[a-z]$/i.test(e.key) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
      const map: Record<string, () => void> = {
        " ": toggle,
        k: toggle,
        arrowleft: () => seekBy(-5),
        arrowright: () => seekBy(5),
        j: () => seekBy(-10),
        l: () => seekBy(10),
        arrowup: () => keyVol(v.volume + 0.05),
        arrowdown: () => keyVol(v.volume - 0.05),
        f: toggleFullscreen,
        m: toggleMute,
        n: goNext,
        "<": () => stepSpeed(-1),
        ">": () => stepSpeed(1),
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
  }, [toggle, seekBy, goNext, poke, speed]);

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
    if (nearEnd && offeringRate && rate === null) setRate("offer");
    // At a finale the rating card comes first; the next episode (a new season) waits to be asked for.
    if (!meta.next || upNextDismissed || offeringRate || !nearEnd || !playing) return;
    setUpNext((n) => (n === null ? Math.max(5, Math.min(15, Math.round(duration - time))) : n));
  }, [nearEnd, playing, meta.next, upNextDismissed, offeringRate, rate, duration, time]);
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
      <video
        ref={video}
        className="absolute inset-0 h-full w-full"
        playsInline
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (pending.current !== null && Math.abs(v.currentTime - pending.current) > 1) v.currentTime = pending.current;
        }}
        onPlaying={() => {
          pending.current = null;
          endIntro();
          setLoading(false);
          setPlaying(true);
          if (!started.current) {
            started.current = true;
            // Phones in the app: playing turns it sideways (the player already fills the screen).
            appImmersive(true);
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
          if (offeringRate) setRate((r) => r ?? "offer");
          else if (meta.next && !upNextDismissed) goNext();
        }}
        onError={onError}
      >
        {sub?.kind === "vtt" && sub.url && <track key={sub.index} kind="subtitles" src={sub.url} srcLang={sub.language ?? undefined} label={sub.label} default />}
      </video>

      {intro !== "gone" && (
        <div
          className={clsx("pointer-events-none absolute inset-0 overflow-hidden bg-black transition-opacity duration-700", intro === "out" && "opacity-0")}
          onTransitionEnd={(e) => e.target === e.currentTarget && setIntro("gone")}
        >
          {meta.backdrop && (
            // eslint-disable-next-line @next/next/no-img-element
            <img {...sized(meta.backdrop, 960, "100vw")} alt="" className="player-splash-bg absolute inset-0 h-full w-full object-cover opacity-40 blur-sm" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/60" />
          {!error && (
            <div className="player-splash-body relative flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
              <div className="text-2xl font-bold drop-shadow sm:text-4xl">{meta.title}</div>
              {meta.subtitle && <div className="text-sm text-white/70 sm:text-base">{meta.subtitle}</div>}
              <JarLoader width={200} label="Starting…" className="mt-6 text-white/80" />
            </div>
          )}
        </div>
      )}

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
                <button className="btn-primary" onClick={() => load(choice, here())}>
                  Try again
                </button>
                <Link prefetch={false} className="btn-ghost" href={meta.backHref}>
                  Back
                </Link>
              </div>
            </div>
          ) : (
            // Starting up: the jelly jar (the splash has its own). Buffering mid-video: a small spinner over the picture.
            intro === "on" ? null : !started.current ? (
              <JarLoader width={220} label="Starting…" className="text-white/80" />
            ) : (
              <span className="player-spinner h-12 w-12 rounded-full border-4 border-white/20 border-t-white" />
            )
          )}
        </div>
      )}

      {/* Top bar */}
      <div className={clsx("absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] transition-opacity duration-300 sm:px-6", controls ? "opacity-100" : "pointer-events-none opacity-0")}>
        <Link prefetch={false} href={meta.backHref} className="player-back rounded-full p-2 hover:bg-white/10" aria-label="Back">
          <Icon name="back" />
        </Link>
        {/* the splash shows the title big while it's up */}
        <div className={clsx("min-w-0 transition-opacity duration-500", intro === "on" && "opacity-0")}>
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

      {/* Contextual: skip intro, up next. Raised above the bottom controls, whose fade reaches up over them. */}
      {segment && controls !== undefined && (
        <button
          onClick={() => seekTo(segment.end)}
          className="absolute bottom-28 right-4 z-10 rounded-xl border border-white/30 bg-black/60 px-4 py-2.5 text-sm font-semibold backdrop-blur transition hover:bg-white hover:text-black sm:right-8"
        >
          Skip {segment.type === "Recap" ? "recap" : segment.type === "Preview" ? "preview" : "intro"} »
        </button>
      )}
      {upNext !== null && meta.next && (
        <div className="absolute bottom-28 right-4 z-10 flex w-80 max-w-[calc(100%-2rem)] gap-3 overflow-hidden rounded-2xl border border-white/15 bg-black/75 p-3 backdrop-blur sm:right-8">
          {meta.next.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img {...sized(meta.next.thumb, 112)} alt="" className="h-16 w-28 shrink-0 rounded-lg bg-white/10 object-cover" />
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

      {finale && rate === "offer" && (
        <div className="absolute bottom-28 right-4 z-10 w-80 max-w-[calc(100%-2rem)] rounded-2xl border border-white/15 bg-black/75 p-4 backdrop-blur sm:right-8">
          <div className="text-[11px] uppercase tracking-wide text-white/60">Finished</div>
          <div className="truncate font-semibold">{finale.title}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black"
              onClick={() => {
                video.current?.pause();
                setRate("open");
              }}
            >
              Rate it
            </button>
            {meta.next && (
              <button className="rounded-lg bg-white/10 px-3 py-1.5 text-xs" onClick={goNext}>
                Next: {meta.next.label}
              </button>
            )}
            <button className="rounded-lg px-3 py-1.5 text-xs text-white/70 hover:text-white" onClick={() => setRate("dismissed")}>
              Not now
            </button>
          </div>
        </div>
      )}
      {finale && rate === "open" && (
        <Modal kicker="Rate it" title={finale.title} onClose={() => setRate("offer")} className="max-w-lg text-fg">
          <RatingForm
            anilistId={finale.anilistId}
            canPush={finale.canPush}
            previous={null}
            embedded
            onSaved={() =>
              window.setTimeout(() => {
                setRate("dismissed");
                say("Rating saved");
              }, 900)
            }
          />
        </Modal>
      )}

      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm backdrop-blur">{toast}</div>
      )}

      {/* Bottom controls */}
      <div
        className={clsx(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-16 transition-opacity duration-300 sm:px-6",
          // hidden under the splash: nothing to control yet
          controls && intro !== "on" ? "opacity-100" : "pointer-events-none opacity-0",
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
              className={clsx("player-range transition-all duration-300 group-hover/vol:w-24 group-hover/vol:opacity-100", volPeek ? "w-24 opacity-100" : "w-0 opacity-0")}
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
            <Btn label="Speed (< >)" active={menu === "speed"} onClick={() => setMenu(menu === "speed" ? null : "speed")}>
              <span className={clsx("text-xs font-semibold tabular-nums", speed !== 1 && "text-[#00a4dc]")}>{speed}×</span>
            </Btn>
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
              <div className="menu-in absolute bottom-12 right-0 z-20 origin-bottom-right max-h-[60vh] w-64 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900/95 p-1.5 shadow-2xl backdrop-blur">
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
                {menu === "speed" &&
                  SPEEDS.map((x) => (
                    <MenuItem
                      key={x}
                      on={speed === x}
                      onClick={() => {
                        applySpeed(x);
                        setMenu(null);
                      }}
                    >
                      {x === 1 ? "Normal" : `${x}×`}
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
  // Bumped on mouse hover and on press: re-drawing the icon under .pi-go plays its move again.
  const [replay, setReplay] = useState(0);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        setReplay((n) => n + 1);
        onClick();
      }}
      onPointerEnter={(e) => e.pointerType === "mouse" && setReplay((n) => n + 1)}
      className={clsx("inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/15 active:scale-90", active && "bg-white/15", className)}
    >
      <span key={replay} className={clsx("contents", replay > 0 && "pi-go")}>
        {children}
      </span>
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
