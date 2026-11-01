"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ShelfHeader } from "../MediaCard";
import { Tabs } from "../PillTabs";
import { sized } from "@/lib/img";
import { ArtGlow } from "../ArtGlow";

export interface ScheduleSlot {
  /** unix seconds */
  at: number;
  episode: number;
  id: number;
  title: string;
  cover: string | null;
  popularity: number;
  /** The viewer's list status, if it's on their list. */
  mine?: string;
  /** Already in the library. */
  have?: boolean;
}

const PER_DAY = 7;

/**
 * The next seven days of episodes, one column per day. Days and times are the viewer's own, so it's laid out in the
 * browser (the server's timezone may differ); until then the columns hold their space.
 */
export function WeekSchedule({ slots, hasList }: { slots: ScheduleSlot[]; hasList: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  useEffect(() => {
    setNow(Date.now());
    try {
      setOnlyMine(localStorage.getItem("schedule:mine") === "1");
    } catch {}
  }, []);

  const days = useMemo(() => {
    if (now === null) return null;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, d) => {
      const from = new Date(start);
      from.setDate(start.getDate() + d);
      const to = new Date(from);
      to.setDate(from.getDate() + 1);
      // A whole season dropping at once is one line ("Ep 1–8"), not eight.
      const byShow = new Map<number, ScheduleSlot & { last: number }>();
      for (const s of slots) {
        if (s.at * 1000 < from.getTime() || s.at * 1000 >= to.getTime() || (onlyMine && !s.mine)) continue;
        const seen = byShow.get(s.id);
        if (seen) seen.last = Math.max(seen.last, s.episode);
        else byShow.set(s.id, { ...s, last: s.episode });
      }
      const all = [...byShow.values()];
      // Everything on your list, then the most popular of the rest, back in airing order.
      const keep = new Set([...all].sort((a, b) => Number(!!b.mine) - Number(!!a.mine) || b.popularity - a.popularity).slice(0, PER_DAY));
      const label = d === 0 ? "Today" : d === 1 ? "Tomorrow" : from.toLocaleDateString(undefined, { weekday: "long" });
      return { label, date: from.toLocaleDateString(undefined, { day: "numeric", month: "short" }), shown: all.filter((s) => keep.has(s)), more: all.length - keep.size };
    });
  }, [now, slots, onlyMine]);

  if (!slots.length) return null;
  const toggle = (v: boolean) => {
    setOnlyMine(v);
    try {
      localStorage.setItem("schedule:mine", v ? "1" : "0");
    } catch {}
  };

  return (
    <section className="mb-10">
      <ShelfHeader
        title="This week"
        actions={
          // Once mounted: the saved choice is only known then, and the jelly shouldn't slide to it on every visit.
          hasList &&
          days && (
            <Tabs
              small
              className="flex gap-1.5 self-center"
              tabs={[
                { key: "all", label: "Everything" },
                { key: "mine", label: "My list" },
              ]}
              active={onlyMine ? "mine" : "all"}
              onSelect={(k) => toggle(k === "mine")}
            />
          )
        }
      />
      <div className="scroll-row -mx-1 grid auto-cols-[minmax(11rem,1fr)] grid-flow-col gap-3 overflow-x-auto px-1 pb-3">
        {(days ?? Array.from({ length: 7 }, () => null)).map((day, d) => (
          <div key={d} className={clsx("relative min-h-64 overflow-hidden rounded-xl border p-2", d === 0 ? "border-accent/50 bg-accent/5" : "border-line bg-panel")}>
            <ArtGlow src={day?.shown[0]?.cover} />
            <div className="relative">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <span className={clsx("text-sm font-semibold", d === 0 && "text-accent")}>{day?.label ?? " "}</span>
              <span className="text-xs text-muted">{day?.date}</span>
            </div>
            {day && !day.shown.length && <p className="px-1 py-6 text-center text-xs text-muted">{onlyMine ? "Nothing from your list" : "Nothing airing"}</p>}
            <ul className="space-y-1.5">
              {day?.shown.map((s) => {
                const aired = s.at * 1000 < now!;
                return (
                  <li key={`${s.id}:${s.episode}`}>
                    <Link prefetch={false}
                      href={`/anime/${s.id}`}
                      className={clsx(
                        "flex gap-2 rounded-lg p-1.5 transition hover:bg-panel-2",
                        s.mine && "bg-anilist/10 ring-1 ring-anilist/30",
                        aired && "opacity-55",
                      )}
                      title={s.title}
                    >
                      {s.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img {...sized(s.cover, 36)} alt="" loading="lazy" decoding="async" className="h-12 w-9 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="h-12 w-9 shrink-0 rounded bg-panel-2" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-xs font-medium leading-snug">{s.title}</div>
                        <div className="mt-0.5 flex gap-1.5 text-[11px] text-muted tabular-nums">
                          <span>{new Date(s.at * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                          <span>· Ep {s.last > s.episode ? `${s.episode}–${s.last}` : s.episode}</span>
                          {s.have && <span className="text-ok">●</span>}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {day && day.more > 0 && <div className="mt-1.5 px-1 text-[11px] text-muted">+{day.more} more</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
