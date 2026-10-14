"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import clsx from "clsx";

interface Row {
  id: number;
  anilistId: number | null;
  title: string;
  scores: Record<string, number>;
  total: number;
  ratedOn: string;
  pushed: boolean;
}

type Sort = "date" | "total" | "title";

function scoreColor(v: number, max: number) {
  const r = v / max;
  return r >= 0.9 ? "text-ok" : r >= 0.7 ? "text-fg" : r >= 0.5 ? "text-warn" : "text-bad";
}

export function RatingsTable({ rows, categories, canPush }: { rows: Row[]; categories: { name: string; max: number }[]; canPush: boolean }) {
  const router = useRouter();
  const [sort, setSort] = useState<Sort>("date");
  const [latestOnly, setLatestOnly] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [autoMatch, setAutoMatch] = useState(true);
  const [relinking, setRelinking] = useState<number | null>(null);

  const visible = useMemo(() => {
    let r = rows;
    if (latestOnly) {
      // rows arrive newest first; keep the first per anime (or per title when unlinked)
      const seen = new Set<string>();
      r = r.filter((x) => {
        const k = x.anilistId ? `a${x.anilistId}` : `t${x.title.toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    const sorted = [...r];
    if (sort === "total") sorted.sort((a, b) => b.total - a.total);
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }, [rows, sort, latestOnly]);

  const call = async (key: string, url: string, init: RequestInit, ok: string) => {
    setBusy(key);
    setMsg(null);
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Failed" });
    setMsg({ ok: true, text: typeof ok === "string" ? ok : "Done" });
    router.refresh();
    return j;
  };

  const importFile = async (file: File) => {
    setBusy("import");
    setMsg({ ok: true, text: autoMatch ? "Importing and matching titles on AniList (rate-limited, may take a minute)…" : "Importing…" });
    const res = await fetch("/api/ratings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: await file.text(), autoMatch }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Import failed" });
    setMsg({
      ok: !j.errors?.length,
      text: `Imported ${j.imported}, skipped ${j.duplicates} already present, auto-matched ${j.autoMatched} titles.${j.errors?.length ? ` ${j.errors.length} bad rows: ${j.errors.slice(0, 3).join("; ")}` : ""}`,
    });
    router.refresh();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="btn-ghost cursor-pointer">
          {busy === "import" ? "Importing…" : "Import CSV"}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={busy === "import"} onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" className="accent-accent" checked={autoMatch} onChange={(e) => setAutoMatch(e.target.checked)} />
          match titles without an AniList id
        </label>
        <a className="btn-ghost" href="/api/ratings/export">
          Export CSV
        </a>
        <span className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" className="accent-accent" checked={latestOnly} onChange={(e) => setLatestOnly(e.target.checked)} />
            latest per anime
          </label>
          <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="date">Newest</option>
            <option value="total">Highest score</option>
            <option value="title">Title</option>
          </select>
        </span>
      </div>
      {msg && <p className={clsx("mb-4 text-sm", msg.ok ? "text-ok" : "text-bad")}>{msg.text}</p>}

      {!rows.length ? (
        <p className="py-16 text-center text-muted">No ratings yet. Rate something from its anime page, or import your CSV log.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr className="border-b border-line">
                <th className="p-3">Title</th>
                {categories.map((c) => (
                  <th key={c.name} className="whitespace-nowrap p-3 text-right" title={`out of ${c.max}`}>
                    {c.name.split("/")[0]}
                  </th>
                ))}
                <th className="p-3 text-right">Total</th>
                <th className="p-3">Rated</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((r) => (
                <tr key={r.id} className="hover:bg-panel-2/50">
                  <td className="p-3">
                    {r.anilistId && relinking !== r.id ? (
                      <span className="group">
                        <a href={`/anime/${r.anilistId}`} className="font-medium hover:underline">
                          {r.title}
                        </a>
                        <button
                          className="ml-2 text-xs text-muted opacity-0 hover:text-fg group-hover:opacity-100"
                          title="Linked to the wrong anime? Change it"
                          onClick={() => setRelinking(r.id)}
                        >
                          relink
                        </button>
                      </span>
                    ) : (
                      <div>
                        <span className="font-medium">{r.title}</span>
                        <LinkInput
                          onLink={async (v) => {
                            await call(`link${r.id}`, `/api/ratings/${r.id}`, { method: "PATCH", body: JSON.stringify({ anilist: v }) }, "Linked");
                            setRelinking(null);
                          }}
                        />
                      </div>
                    )}
                  </td>
                  {categories.map((c) => (
                    <td key={c.name} className={clsx("p-3 text-right tabular-nums", scoreColor(r.scores[c.name] ?? 0, c.max))}>
                      {r.scores[c.name]}
                    </td>
                  ))}
                  <td className="p-3 text-right text-base font-semibold tabular-nums">{r.total}</td>
                  <td className="whitespace-nowrap p-3 text-muted">{r.ratedOn}</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    {r.anilistId && canPush && (
                      <button
                        className={clsx("mr-3 text-xs", r.pushed ? "text-muted" : "text-anilist hover:underline")}
                        disabled={busy === `push${r.id}`}
                        title={r.pushed ? "Already pushed; click to push again" : "Set this as your AniList score and mark completed"}
                        onClick={() => call(`push${r.id}`, `/api/ratings/${r.id}`, { method: "PATCH", body: JSON.stringify({ push: true }) }, `Pushed ${r.total} to AniList`)}
                      >
                        {busy === `push${r.id}` ? "…" : r.pushed ? "✓ on AniList" : "Push"}
                      </button>
                    )}
                    <button
                      className="text-xs text-muted hover:text-bad"
                      onClick={() => confirm(`Delete this rating of ${r.title}?`) && call(`del${r.id}`, `/api/ratings/${r.id}`, { method: "DELETE" }, "Deleted")}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function LinkInput({ onLink }: { onLink: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="mt-1 flex gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onLink(v.trim());
      }}
    >
      <input className="input h-7 max-w-56 py-0 text-xs" placeholder="AniList URL or id to link" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="text-xs text-accent hover:underline">Link</button>
    </form>
  );
}
