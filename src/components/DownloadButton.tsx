"use client";

import clsx from "clsx";
import { download, useDownload, type AppDownload } from "@/lib/app";

/**
 * Keep this on the phone (only inside the Android app; renders nothing in a browser): a download arrow, then a
 * progress ring, then a tick. A failed one offers to try again.
 */
export function DownloadButton({ item, className }: { item: AppDownload; className?: string }) {
  const s = useDownload(item.key);
  if (s === undefined) return null;
  const busy = s?.state === "queued" || s?.state === "downloading";
  const done = s?.state === "done";
  const label = done ? "Downloaded to this phone" : busy ? `Downloading… ${Math.round((s?.progress ?? 0) * 100)}%` : s?.state === "failed" ? "Download failed: try again" : "Download to this phone";
  return (
    <button
      type="button"
      className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", done ? "text-ok" : s?.state === "failed" ? "text-bad" : "text-muted hover:text-fg", className)}
      disabled={busy || done}
      onClick={() => download(item)}
      title={label}
      aria-label={label}
    >
      {busy ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5 -rotate-90" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.5" />
          <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.max(3, (s?.progress ?? 0) * 100)} 100`} />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {done ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" />}
        </svg>
      )}
    </button>
  );
}
