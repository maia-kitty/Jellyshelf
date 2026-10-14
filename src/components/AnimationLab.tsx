"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AppIcon, JarLoader } from "./AppIcon";
import { DEBUG_COOKIE, MAX_DEBUG_DELAY, type DebugOptions } from "@/lib/debugShared";

const SPEEDS = [0.1, 0.25, 0.5, 1, 2];

interface Demo {
  id: string;
  title: string;
  where: string;
  /** Length of the timeline the scrubber covers, in ms (one cycle for looping animations). */
  duration: number;
  render: (opts: { loaderWidth: number; run: number }) => React.ReactNode;
}

const DEMOS: Demo[] = [
  {
    id: "loader",
    title: "Loading screen",
    where: "Page changes, and the episode list on anime/series pages",
    duration: 9000,
    render: ({ loaderWidth }) => <JarLoader label="Loading…" width={loaderWidth} />,
  },
  {
    id: "pop",
    title: "Request sent",
    where: "Next to the confirmation after requesting something",
    duration: 1000,
    render: () => <AppIcon size={96} animate="pop" className="text-fg" />,
  },
  {
    id: "intro",
    title: "Login intro",
    where: "The jar on the sign-in page",
    duration: 1400,
    render: () => <AppIcon size={96} animate="intro" className="text-fg" />,
  },
  {
    id: "hover",
    title: "Logo hover",
    where: "The logo in the top bar, when you hover it",
    duration: 900,
    render: () => <AppIcon size={96} className="jar-play-open text-fg" />,
  },
  {
    id: "bob",
    title: "Lid bob",
    where: "Small inline loading indicator",
    duration: 1300,
    render: () => <AppIcon size={96} animate="loading" className="text-fg" />,
  },
];

export function AnimationLab({ debug }: { debug: DebugOptions }) {
  const [speed, setSpeed] = useState(1);
  const [reduced, setReduced] = useState(false);
  const [loaderWidth, setLoaderWidth] = useState(260);

  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-center gap-x-8 gap-y-4 p-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Speed</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={clsx("rounded-md px-2 py-1 tabular-nums", s === speed ? "bg-accent text-white" : "bg-panel-2 text-muted hover:text-fg")}
            >
              {s}×
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-accent" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
          Show what reduced-motion users see
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Loader width</span>
          <input type="range" min={120} max={420} value={loaderWidth} onChange={(e) => setLoaderWidth(Number(e.target.value))} className="accent-accent" />
          <span className="w-12 tabular-nums text-muted">{loaderWidth}px</span>
        </label>
      </section>

      <div className={clsx("grid gap-6 md:grid-cols-2", reduced && "simulate-reduced-motion")}>
        {DEMOS.map((d) => (
          <DemoCard key={d.id} demo={d} speed={speed} loaderWidth={loaderWidth} />
        ))}
      </div>

      <SlowLoading initial={debug} />
    </div>
  );
}

function DemoCard({ demo, speed, loaderWidth }: { demo: Demo; speed: number; loaderWidth: number }) {
  const stage = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0); // bump to remount = replay from the start
  const [paused, setPaused] = useState(false);
  const [time, setTime] = useState(0);

  const animations = useCallback(() => stage.current?.getAnimations({ subtree: true }) ?? [], []);

  // Apply speed / pause to whatever is on stage, including animations that start after a replay,
  // so this runs every frame rather than once per replay.
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  speedRef.current = speed;
  pausedRef.current = paused;
  useEffect(() => {
    for (const a of animations()) if (!paused && a.playState === "paused") a.play();
  }, [animations, paused]);

  // Timeline readout.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      for (const a of animations()) {
        if (a.playbackRate !== speedRef.current) a.playbackRate = speedRef.current;
        if (pausedRef.current && a.playState === "running") a.pause();
      }
      const t = animations()[0]?.currentTime;
      setTime(typeof t === "number" ? t % (demo.duration + 1000) : 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animations, demo.duration, run]);

  const scrub = (ms: number) => {
    setPaused(true);
    for (const a of animations()) {
      a.pause();
      a.currentTime = ms;
    }
    setTime(ms);
  };

  return (
    <section className="card flex flex-col p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{demo.title}</h2>
        <span className="text-xs tabular-nums text-muted">{(time / 1000).toFixed(2)}s</span>
      </div>
      <p className="mb-4 text-xs text-muted">{demo.where}</p>

      <div ref={stage} key={run} className="flex min-h-40 items-center justify-center rounded-lg bg-bg py-8">
        {demo.render({ loaderWidth, run })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="btn-primary px-3 py-1.5"
          onClick={() => {
            setPaused(false);
            setRun((r) => r + 1);
          }}
        >
          ↻ Replay
        </button>
        <button className="btn-ghost px-3 py-1.5" onClick={() => setPaused((p) => !p)}>
          {paused ? "▶ Play" : "❚❚ Pause"}
        </button>
        <input
          type="range"
          min={0}
          max={demo.duration}
          step={10}
          value={Math.min(time, demo.duration)}
          onChange={(e) => scrub(Number(e.target.value))}
          className="min-w-32 flex-1 accent-accent"
          aria-label={`Scrub ${demo.title}`}
        />
      </div>
    </section>
  );
}

const DELAYS = [0, 1000, 2000, 3000, 5000, MAX_DEBUG_DELAY];

/** Slows real page/episode loading in this browser so the actual loading screens can be seen in place. */
function SlowLoading({ initial }: { initial: DebugOptions }) {
  const [opts, setOpts] = useState(initial);
  const [saved, setSaved] = useState(false);

  const save = (next: DebugOptions) => {
    setOpts(next);
    const on = next.pageDelay > 0 || next.episodesDelay > 0;
    document.cookie = on
      ? `${DEBUG_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=86400; samesite=lax`
      : `${DEBUG_COOKIE}=; path=/; max-age=0; samesite=lax`;
    setSaved(true);
  };

  const select = (key: keyof DebugOptions, label: string) => (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-40 text-muted">{label}</span>
      <select className="input w-auto" value={opts[key]} onChange={(e) => save({ ...opts, [key]: Number(e.target.value) })}>
        {DELAYS.map((ms) => (
          <option key={ms} value={ms}>
            {ms === 0 ? "Off" : `+${ms / 1000}s`}
          </option>
        ))}
      </select>
    </label>
  );

  const active = opts.pageDelay > 0 || opts.episodesDelay > 0;
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Simulate slow loading</h2>
        {active && <span className="rounded-md bg-warn/90 px-2 py-0.5 text-xs font-semibold text-black">ON in this browser</span>}
      </div>
      <p className="mt-1 mb-4 text-sm text-muted">
        Adds a delay so you can see the real loading screens while browsing. Only affects this browser, and switches itself off after a day.
      </p>
      <div className="space-y-3">
        {select("pageDelay", "Every page")}
        {select("episodesDelay", "Episode lists")}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <a className="btn-ghost" href="/discover/anime">
          Try it: open Anime
        </a>
        {active && (
          <button className="btn-ghost" onClick={() => save({ pageDelay: 0, episodesDelay: 0 })}>
            Turn off
          </button>
        )}
        {saved && <span className="text-ok">Saved</span>}
      </div>
    </section>
  );
}
