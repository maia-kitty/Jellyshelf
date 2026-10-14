/** AniList descriptions are light HTML (<br>, <i>, <b>) with trailing "(Source: …)" credits. */
export function aniDescription(s: string | null | undefined, { oneParagraph = false } = {}) {
  const text = (s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\(Source:[^)]*\)/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return oneParagraph ? text.replace(/\s+/g, " ").replace(/\s+([.,!?])/g, "$1") : text;
}
