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
