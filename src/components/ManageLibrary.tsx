"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ManagedTitle } from "@/lib/manage";
import { unreachable } from "@/lib/unreachable";
import { Modal } from "./Modal";

const gb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

/** Settings → Manage library: everything in Sonarr/Radarr, biggest first, each deletable (files and all) after a confirm. */
export function ManageLibrary({ titles, errors }: { titles: ManagedTitle[]; errors: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<ManagedTitle | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const shown = titles.filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase()));
  const total = titles.reduce((a, t) => a + t.size, 0);

  const remove = async (t: ManagedTitle) => {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/library/${t.service}/${t.id}`, { method: "DELETE" }).catch(unreachable);
    setBusy(false);
    if (!res.ok) return setErr((await res.json().catch(() => ({}))).error ?? "Couldn't delete it");
    setConfirm(null);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      {errors.map((e) => (
        <p key={e} className="text-sm text-bad">
          Couldn&apos;t read {e}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Filter by title" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-sm text-muted">
          {titles.length} titles · {gb(total)}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((t) => (
          <li key={`${t.service}:${t.id}`} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate">
                {t.href ? (
                  <a href={t.href} className="hover:underline">
                    {t.title}
                  </a>
                ) : (
                  t.title
                )}
                {t.year && <span className="text-muted"> ({t.year})</span>}
              </div>
              <div className="text-xs text-muted">
                {t.service === "sonarr" ? `Sonarr · ${t.files} episode files` : t.files ? "Radarr" : "Radarr · not downloaded"}
                {t.requestedBy.length > 0 && ` · requested by ${t.requestedBy.join(", ")}`}
              </div>
            </div>
            <span className="shrink-0 text-sm tabular-nums text-muted">{t.size ? gb(t.size) : "—"}</span>
            <button className="btn-danger shrink-0 px-3 py-1" onClick={() => (setErr(null), setConfirm(t))}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="py-6 text-center text-sm text-muted">Nothing here.</p>}

      {confirm && (
        <Modal title={`Delete ${confirm.title}?`} onClose={() => !busy && setConfirm(null)} className="max-w-md">
          <div className="space-y-3 p-5 text-sm">
            <p>This can&apos;t be undone. It:</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>
                removes it from {confirm.service === "sonarr" ? "Sonarr" : "Radarr"}
                {confirm.service === "sonarr" && ", every season"}
              </li>
              <li>{confirm.size ? `deletes its files from disk, freeing ${gb(confirm.size)}` : "has no files to delete"}, so it leaves Jellyfin too</li>
              {confirm.requestedBy.length > 0 && <li>removes its requests (from {confirm.requestedBy.join(", ")}), so it can be requested again</li>}
            </ul>
            {err && <p className="text-bad">{err}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost px-3 py-1" disabled={busy} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button className="btn-danger px-3 py-1" disabled={busy} onClick={() => remove(confirm)}>
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
