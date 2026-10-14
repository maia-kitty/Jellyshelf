"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import clsx from "clsx";
import type { RatingRow } from "@/lib/ratings";

interface Unlinked {
  id: number;
  title: string;
  total: number;
  ratedOn: string;
}

type Sort = "date" | "score" | "title";

const scoreOf = (r: RatingRow) => r.anilistScore ?? r.rubric?.total ?? 0;

function tone(v: number, max: number) {
  const r = v / max;
  return r >= 0.9 ? "text-ok" : r >= 0.7 ? "text-fg" : r >= 0.5 ? "text-warn" : "text-bad";
}

async function send(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Failed");
  return j;
}

export function RatingsTable(props: { rows: RatingRow[]; unlinked: Unlinked[]; categories: { name: string; max: number }[]; canPush: boolean }) {
  const { rows, categories, canPush } = props;
  const router = useRouter();
  const [sort, setSort] = useState<Sort>("date");
  const [rubricOnly, setRubricOnly] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => {
    const r = rubricOnly ? rows.filter((x) => x.rubric) : [...rows];
    if (sort === "score") r.sort((a, b) => scoreOf(b) - scoreOf(a));
    else if (sort === "title") r.sort((a, b) => a.title.localeCompare(b.title));
    else r.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return r;
  }, [rows, sort, rubricOnly]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">
          {rows.length} rated · {rows.filter((r) => r.rubric).length} with rubric
        </span>
        <span className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" className="accent-accent" checked={rubricOnly} onChange={(e) => setRubricOnly(e.target.checked)} />
            only with rubric
          </label>
          <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="date">Newest</option>
            <option value="score">Highest score</option>
            <option value="title">Title</option>
          </select>
        </span>
      </div>
      {msg && <p className={clsx("mb-4 text-sm", msg.ok ? "text-ok" : "text-bad")}>{msg.text}</p>}

      {!rows.length ? (
        <p className="py-16 text-center text-muted">Nothing rated yet. Rate something from its anime page.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr className="border-b border-line">
                <th className="p-3">Anime</th>
                <th className="p-3 text-right">Score</th>
                {categories.map((c) => (
                  <th key={c.name} className="whitespace-nowrap p-3 text-right" title={`out of ${c.max}`}>
                    {c.name.split("/")[0]}
                  </th>
                ))}
                <th className="p-3">Rated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((r) => {
                const differs = r.rubric && r.anilistScore !== null && r.rubric.total !== r.anilistScore;
                return (
                  <tr key={r.anilistId} className="hover:bg-panel-2/50">
                    <td className="p-3">
                      <a href={`/anime/${r.anilistId}`} className="flex items-center gap-3">
                        {r.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.cover} alt="" className="h-12 w-8 shrink-0 rounded object-cover" loading="lazy" />
                        ) : (
                          <div className="h-12 w-8 shrink-0 rounded bg-panel-2" />
                        )}
                        <span>
                          <span className="font-medium hover:underline">{r.title}</span>
                          <span className="block text-xs text-muted">{r.sub}</span>
                        </span>
                      </a>
                    </td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <span className="text-base font-semibold tabular-nums">{scoreOf(r)}</span>
                      {r.anilistScore === null && (
                        <span className="block text-xs">
                          {canPush ? (
                            <button
                              className="text-anilist hover:underline"
                              disabled={busy === `push${r.anilistId}`}
                              onClick={() =>
                                run(`push${r.anilistId}`, () => send(`/api/ratings/${r.rubric!.id}`, { method: "PATCH", body: JSON.stringify({ push: true }) }), `Pushed ${r.rubric!.total} to AniList`)
                              }
                            >
                              {busy === `push${r.anilistId}` ? "…" : "not on AniList · push"}
                            </button>
                          ) : (
                            <span className="text-muted">rubric only</span>
                          )}
                        </span>
                      )}
                      {differs && (
                        <span className="block text-xs text-warn" title="Your AniList score was changed after this rubric rating">
                          rubric {r.rubric!.total}
                        </span>
                      )}
                    </td>
                    {categories.map((c) => {
                      const v = r.rubric?.scores[c.name];
                      return (
                        <td key={c.name} className={clsx("p-3 text-right tabular-nums", v === undefined ? "text-line" : tone(v, c.max), differs && "opacity-60")}>
                          {v ?? "—"}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap p-3 text-muted">
                      {r.date}
                      {r.rubric && r.rubric.count > 1 && <span className="block text-xs">rated {r.rubric.count}×</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CsvTools unlinked={props.unlinked} run={run} busy={busy} />
    </>
  );
}

/** Tucked away: bring in rubric breakdowns from the old rating script's CSV, export them back out. */
function CsvTools({
  unlinked,
  run,
  busy,
}: {
  unlinked: Unlinked[];
  run: (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void>;
  busy: string | null;
}) {
  const [autoMatch, setAutoMatch] = useState(true);
  return (
    <details className="mt-10 text-sm text-muted">
      <summary className="cursor-pointer select-none hover:text-fg">
        CSV import / export{unlinked.length > 0 && ` · ${unlinked.length} imported ratings need linking`}
      </summary>
      <div className="mt-4 space-y-4">
        <p>
          Import rubric breakdowns from <code>anime_ratings.csv</code> (the old rating script&apos;s log). Scores keep coming from AniList;
          this only fills in the per-category columns.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-ghost cursor-pointer">
            {busy === "import" ? "Importing…" : "Import CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy === "import"}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const csv = await file.text();
                await run(
                  "import",
                  async () => {
                    const j = await send("/api/ratings/import", { method: "POST", body: JSON.stringify({ csv, autoMatch }) });
                    if (j.errors?.length) throw new Error(`Imported ${j.imported}; ${j.errors.length} bad rows: ${j.errors.slice(0, 3).join("; ")}`);
                  },
                  "Imported",
                );
              }}
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-accent" checked={autoMatch} onChange={(e) => setAutoMatch(e.target.checked)} />
            match titles without an AniList id (slow: AniList is rate-limited)
          </label>
          <a className="btn-ghost" href="/api/ratings/export">
            Export CSV
          </a>
        </div>
        {unlinked.length > 0 && (
          <div>
            <p className="mb-2">These couldn&apos;t be matched to an AniList entry. Paste an AniList URL or id to attach them:</p>
            <ul className="space-y-2">
              {unlinked.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3">
                  <span className="text-fg">{u.title}</span>
                  <span className="tabular-nums">{u.total}/100</span>
                  <span>{u.ratedOn}</span>
                  <LinkInput onLink={(v) => run(`link${u.id}`, () => send(`/api/ratings/${u.id}`, { method: "PATCH", body: JSON.stringify({ anilist: v }) }), "Linked")} />
                  <button className="text-xs hover:text-bad" onClick={() => run(`del${u.id}`, () => send(`/api/ratings/${u.id}`, { method: "DELETE" }), "Deleted")}>
                    delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function LinkInput({ onLink }: { onLink: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="flex gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onLink(v.trim());
      }}
    >
      <input className="input h-7 w-56 py-0 text-xs" placeholder="anilist.co/anime/… or id" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="text-xs text-accent hover:underline">Link</button>
    </form>
  );
}
