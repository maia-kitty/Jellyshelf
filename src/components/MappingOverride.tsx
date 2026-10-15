"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "./Modal";

interface Values {
  tvdbId: number | null;
  tmdbMovieId: number | null;
  tvdbSeason: number | null;
  episodeOffset: number;
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));

/** Admin-only: fix a wrong AniList → TVDB/TMDB mapping. */
export function MappingOverride({ anilistId, initial }: { anilistId: number; initial: Values }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    tvdbId: initial.tvdbId?.toString() ?? "",
    tmdbMovieId: initial.tmdbMovieId?.toString() ?? "",
    tvdbSeason: initial.tvdbSeason?.toString() ?? "",
    episodeOffset: initial.episodeOffset.toString(),
  });
  const [msg, setMsg] = useState("");

  const save = async (method: "PUT" | "DELETE") => {
    setMsg("");
    const res = await fetch(`/api/mapping/${anilistId}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body:
        method === "PUT"
          ? JSON.stringify({
              tvdbId: num(v.tvdbId),
              tmdbMovieId: num(v.tmdbMovieId),
              tvdbSeason: num(v.tvdbSeason),
              episodeOffset: num(v.episodeOffset) ?? 0,
            })
          : undefined,
    });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Saved" : (j.error ?? "Failed"));
    if (res.ok) router.refresh();
  };

  const field = (key: keyof typeof v, label: string, hint: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} placeholder={hint} />
    </label>
  );

  const summary = `TVDB ${initial.tvdbId ?? "—"} · season ${initial.tvdbSeason === -1 ? "absolute" : (initial.tvdbSeason ?? "—")} · offset ${initial.episodeOffset} · TMDB movie ${initial.tmdbMovieId ?? "—"}`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-muted">
      <span>Mapping (admin): {summary}</span>
      <button className="text-accent hover:underline" onClick={() => setOpen(true)}>
        Edit
      </button>
      {open && (
        <Modal kicker="Mapping (admin)" title="Where this entry goes in Sonarr / Radarr" onClose={() => setOpen(false)} className="max-w-md">
          <div className="space-y-3 p-5 text-sm">
            {field("tvdbId", "TVDB series id", "e.g. 267440")}
            {field("tvdbSeason", "TVDB season", "-1 = absolute numbering")}
            {field("episodeOffset", "Episode offset", "episodes before this entry in that season")}
            {field("tmdbMovieId", "TMDB movie id", "for films")}
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => save("PUT")}>
                Save override
              </button>
              <button className="btn-ghost" onClick={() => save("DELETE")}>
                Reset
              </button>
            </div>
            {msg && <p className="text-xs text-muted">{msg}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
