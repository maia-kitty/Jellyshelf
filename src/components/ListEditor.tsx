"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import type { AniListStatus } from "@/lib/clients/anilist";
import type { ListChange } from "@/lib/listEntry";

export interface EditableEntry {
  status: AniListStatus;
  progress: number;
  score: number;
}

export async function patchEntry(mediaId: number, change: ListChange): Promise<EditableEntry> {
  const res = await fetch("/api/anilist/entry", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaId, change }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "AniList update failed");
  return j;
}

/** Compact "+1 episode" control for list grids. */
export function ProgressBump({ mediaId, progress, episodes }: { mediaId: number; progress: number; episodes: number | null }) {
  const router = useRouter();
  const [p, setP] = useState(progress);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const done = !!episodes && p >= episodes;
  return (
    <button
      className={clsx("mt-1.5 w-full rounded-lg border px-2 py-1 text-xs transition", err ? "border-bad text-bad" : "border-line text-muted hover:border-anilist hover:text-fg")}
      disabled={busy || done}
      title={err ? "Update failed, click to retry" : undefined}
      onClick={async () => {
        setBusy(true);
        setErr(false);
        try {
          const next = await patchEntry(mediaId, { kind: "progress", value: p + 1 });
          setP(next.progress);
          if (next.status === "COMPLETED") router.refresh();
        } catch {
          setErr(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      {done ? "Done" : busy ? "…" : `+1 · ${p}/${episodes ?? "?"}`}
    </button>
  );
}
