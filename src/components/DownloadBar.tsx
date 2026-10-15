import clsx from "clsx";
import type { DownloadProgress } from "@/lib/downloads";

const STATE_LABEL: Record<DownloadProgress["state"], string> = {
  downloading: "Downloading",
  queued: "Queued",
  importing: "Importing",
  stuck: "Stuck",
};

function duration(s: number) {
  if (s < 60) return "under a minute";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

/** Progress of a request's files in the Sonarr/Radarr queue. */
export function DownloadBar({ d, className }: { d: DownloadProgress; className?: string }) {
  const pct = Math.round(d.progress * 100);
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={d.state === "stuck" ? "text-warn" : "text-fg/80"}>
          {STATE_LABEL[d.state]}
          {d.state !== "importing" && !(d.state === "queued" && pct === 0) && ` ${pct}%`}
          {d.items > 1 && <span className="text-muted"> · {d.items} episodes</span>}
        </span>
        {d.secondsLeft !== null && d.state === "downloading" && <span className="text-muted">{duration(d.secondsLeft)} left</span>}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div
          className={clsx("h-full rounded-full transition-[width] duration-700", d.state === "queued" && "opacity-50", d.state === "importing" && "animate-pulse")}
          style={{
            width: `${d.state === "importing" ? 100 : Math.max(pct, 2)}%`,
            backgroundImage: d.state === "stuck" ? undefined : "linear-gradient(90deg, #aa5cc3, #00a4dc)",
            backgroundColor: d.state === "stuck" ? "var(--color-warn)" : undefined,
          }}
        />
      </div>
      {d.message && <div className="mt-1 line-clamp-2 text-xs text-warn">{d.message}</div>}
    </div>
  );
}
