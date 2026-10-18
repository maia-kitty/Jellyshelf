/** Sonarr/Radarr report track languages as ISO 639-2 ("jpn/eng"); show them as short codes like Bazarr's ("JA", "EN"). */
const ISO2: Record<string, string> = {
  eng: "en", jpn: "ja", ger: "de", deu: "de", fre: "fr", fra: "fr", spa: "es", ita: "it", por: "pt", rus: "ru",
  chi: "zh", zho: "zh", kor: "ko", ara: "ar", hin: "hi", pol: "pl", dut: "nl", nld: "nl", swe: "sv", nor: "no",
  dan: "da", fin: "fi", cze: "cs", ces: "cs", slo: "sk", slk: "sk", hun: "hu", gre: "el", ell: "el", tur: "tr",
  heb: "he", tha: "th", vie: "vi", ind: "id", may: "ms", msa: "ms", ukr: "uk", rum: "ro", ron: "ro", bul: "bg",
  hrv: "hr", srp: "sr", cat: "ca", fil: "fil", tgl: "tl",
};

/** "jpn/eng/eng" → ["JA", "EN"]; unknown or undetermined tracks are left out. */
export function trackLangs(s: string | null | undefined): string[] {
  const codes = (s ?? "")
    .split(/[/,]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x && x !== "und" && x !== "zxx" && x !== "mul")
    .map((x) => (ISO2[x] ?? x).toUpperCase());
  return [...new Set(codes)];
}

const names = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "language" }) : null;

/** "JA" → "Japanese" */
export function langName(code: string) {
  try {
    return names?.of(code.toLowerCase()) ?? code;
  } catch {
    return code;
  }
}

/** Bazarr-style label → readable: "EN HI" → "English (HI)", "JA forced" → "Japanese (forced)" */
export function subName(label: string) {
  const [code, ...rest] = label.split(" ");
  return rest.length ? `${langName(code)} (${rest.join(", ")})` : langName(code);
}

// Release groups ([Erai-raws]), sources (CR = Crunchyroll, NF = Netflix, …) and formats (SRT, AAC 2.0, …) that files put in
// track titles; they say nothing about what the track is.
const NOISE = /\[[^\]]*\]|\b(?:CR|NF|AMZN|DSNP|HMAX|ATVP|HIDIVE|iTunes|MoviesAnywhere|SRT|ASS|SSA|PGS|SUP|VTT|SUBRIP|AAC|Opus|FLAC|E?-?AC-?3|DTS(?:-HD)?|TrueHD|Atmos|\d\.\d)\b/gi;

/** "dan" → "dansk": what a language calls itself. */
function ownName(language: string) {
  const code = trackLangs(language)[0]?.toLowerCase();
  try {
    return code ? new Intl.DisplayNames([code], { type: "language" }).of(code) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A track's name for the menus: its language, plus whatever the file's title adds beyond the language and the noise
 * ("Brazilian_CR" in Portuguese → "Portuguese · Brazilian", "CR" → "English"), and SDH/Forced when the title doesn't say.
 */
export function trackLabel(t: { title?: string | null; language?: string | null; hi?: boolean; forced?: boolean }, fallback: string) {
  const name = t.language ? langName(trackLangs(t.language)[0] ?? t.language) : null;
  let extra = (t.title ?? "").replace(/_/g, " ").replace(NOISE, " ");
  if (name) extra = extra.replace(new RegExp(`\\b${name.replace(/[^\w\s]/g, "")}\\b`, "i"), " ");
  extra = extra
    .replace(/\(\s*\)/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-/|,:·]+|[\s\-/|,:·]+$/g, "")
    .replace(/^\(([^()]*)\)$/, "$1");
  // A title that's just the language in its own words ("Dansk", "العربية") repeats it.
  if (name && extra.toLowerCase() === ownName(t.language!)?.toLowerCase()) extra = "";
  if (t.hi && !/sdh|hearing|\bcc\b/i.test(extra)) extra = [extra, "SDH"].filter(Boolean).join(" · ");
  if (t.forced && !/forced/i.test(extra)) extra = [extra, "Forced"].filter(Boolean).join(" · ");
  return [name ?? (extra ? null : fallback), extra].filter(Boolean).join(" · ");
}
