/**
 * Anime rating rubric (ported from ~/anime_rating-anilist.py): seven categories summing to 100.
 * Shared between server and client: keep this file free of server-only imports.
 */
export interface RatingCategory {
  name: string;
  max: number;
  anchors: Record<number, string>;
}

export const CATEGORIES: RatingCategory[] = [
  {
    name: "Story",
    max: 20,
    anchors: {
      0: "Incoherent or actively bad",
      5: "Hard to follow / full of holes",
      10: "Functional but unremarkable",
      15: "Solid, no major issues",
      20: "Exceptional, everything paid off",
    },
  },
  {
    name: "Characters",
    max: 20,
    anchors: {
      0: "Flat, no investment at all",
      5: "Barely developed",
      10: "Decent, some growth",
      15: "Cared about most of them",
      20: "Deeply written, fully invested",
    },
  },
  {
    name: "Enjoyment",
    max: 20,
    anchors: {
      0: "Actively unpleasant to watch",
      5: "Slog, mostly bored",
      10: "Fine, kept watching",
      15: "Had a genuinely good time",
      20: "Pure joy episode to episode",
    },
  },
  {
    name: "Animation/Art",
    max: 10,
    anchors: { 0: "Distractingly bad", 3: "Below average", 5: "Competent, unremarkable", 8: "Great visuals", 10: "Stunning, best-in-class" },
  },
  {
    name: "Sound",
    max: 10,
    anchors: { 0: "Grating or absent", 3: "Forgettable", 5: "Solid, does the job", 8: "Great OST/VA work", 10: "Elevates the whole show" },
  },
  {
    name: "Ending/Impact",
    max: 10,
    anchors: {
      0: "Ruined the show",
      3: "Weak, undercut everything",
      5: "Fine, didn't add or subtract",
      8: "Stuck with you",
      10: "Perfect, still thinking about it",
    },
  },
  {
    name: "Originality",
    max: 10,
    anchors: { 0: "Pure retread, nothing new", 3: "Very familiar", 5: "Some fresh elements", 8: "Distinct take", 10: "Genuinely novel" },
  },
];

/** The anchor text that applies to a score: the highest anchor at or below it. */
export function anchorFor(cat: RatingCategory, score: number): string {
  const keys = Object.keys(cat.anchors)
    .map(Number)
    .sort((a, b) => a - b);
  const k = keys.filter((x) => x <= score).pop() ?? keys[0];
  return cat.anchors[k];
}

export function validateScores(scores: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of CATEGORIES) {
    const v = scores[c.name];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > c.max) {
      throw new Error(`${c.name} must be a whole number between 0 and ${c.max}`);
    }
    out[c.name] = v;
  }
  return out;
}

export const total = (scores: Record<string, number>) => CATEGORIES.reduce((s, c) => s + (scores[c.name] ?? 0), 0);

// ---------- CSV (same layout as the script's ~/anime_ratings.csv) ----------

export const CSV_HEADER = ["date", "title", "anilist_id", ...CATEGORIES.map((c) => c.name), "total"];

function csvCell(v: string | number | null) {
  const s = v === null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: { ratedOn: string; title: string; anilistId: number | null; scores: Record<string, number>; total: number }[]) {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push([r.ratedOn, r.title, r.anilistId, ...CATEGORIES.map((c) => r.scores[c.name] ?? 0), r.total].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

/** Minimal RFC 4180 parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

export interface ImportedRating {
  ratedOn: string;
  title: string;
  anilistId: number | null;
  scores: Record<string, number>;
  total: number;
}

/**
 * Accepts both the old log layout (no anilist_id column) and the current one. Columns are matched by header name.
 * The script only writes a header when creating the file, so an old-layout file can contain newer rows with an
 * extra anilist_id column; those are detected by their length and read with the current layout.
 */
export function parseRatingsCsv(text: string): { rows: ImportedRating[]; errors: string[] } {
  const [header, ...body] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) return { rows: [], errors: ["Empty file"] };
  const find = (cols: string[], name: string) => cols.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const col = (name: string) => find(header, name);
  const missing = ["date", "title", ...CATEGORIES.map((c) => c.name)].filter((n) => col(n) < 0);
  if (missing.length) return { rows: [], errors: [`Missing columns: ${missing.join(", ")}`] };

  const rows: ImportedRating[] = [];
  const errors: string[] = [];
  const upgraded = col("anilist_id") < 0;
  body.forEach((r, i) => {
    const layout = upgraded && r.length === CSV_HEADER.length ? CSV_HEADER : header;
    const col = (name: string) => find(layout, name);
    try {
      const scores = validateScores(Object.fromEntries(CATEGORIES.map((c) => [c.name, Number(r[col(c.name)])])));
      const idRaw = col("anilist_id") >= 0 ? r[col("anilist_id")]?.trim() : "";
      rows.push({
        ratedOn: r[col("date")].trim(),
        title: r[col("title")].trim(),
        anilistId: idRaw && /^\d+$/.test(idRaw) ? Number(idRaw) : null,
        scores,
        total: total(scores),
      });
    } catch (e) {
      errors.push(`Line ${i + 2}: ${(e as Error).message}`);
    }
  });
  return { rows, errors };
}
