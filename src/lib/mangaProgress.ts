import type { User } from "@/db/schema";
import { anilistToken } from "@/lib/auth";
import { anilistManga, aniTitle } from "@/lib/clients/anilist";
import { mangarr, type MangarrChapter } from "@/lib/clients/mangarr";
import type { Card } from "@/lib/cards";
import type { LibraryItem } from "@/lib/library";
import { listPatch } from "@/lib/listEntry";
import { getSettings } from "@/lib/settings";
import { viewerToday } from "@/lib/today";
import { aniDescription } from "@/lib/text";

/**
 * AniList counts manga progress in whole chapters, so finishing 12.5 counts as 12 (and an extra numbered 0 or below
 * as nothing). Returns the progress to save, or null when the chapter doesn't move it.
 */
export function chapterProgress(chapter: number): number | null {
  const n = Math.floor(chapter);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** The first downloaded chapter after AniList progress `progress` (12 → 12.5 or 13), or the first one there is. */
export function nextChapter(progress: number, chapters: Pick<MangarrChapter, "number" | "onDisk">[]): number | null {
  const there = chapters.filter((c) => c.onDisk).map((c) => c.number).sort((a, b) => a - b);
  return there.find((n) => n > progress) ?? null;
}

/**
 * A chapter was read to the end in the reader: move the reader's AniList progress up to it. Only ever forward
 * (rereading chapter 3 doesn't undo 40), and the same conventions as episodes: it starts the manga, finishing the
 * last chapter of a finished manga completes it. Null when nothing changed (no AniList, or already that far).
 */
export async function readChapter(user: User, anilistId: number, chapter: number) {
  const token = anilistToken(user);
  const progress = chapterProgress(chapter);
  if (!token || !user.anilistId || progress === null) return null;
  const [list, media] = await Promise.all([anilistManga.userList(user.anilistId, token), anilistManga.media(anilistId)]);
  const entry = list.get(anilistId);
  if (entry && entry.progress >= progress && entry.status !== "REPEATING") return null;
  // AniList only knows the chapter count of a finished manga; a running one can't be completed by reading.
  const total = media?.status === "FINISHED" ? media.chapters : null;
  const patch = listPatch(entry, total, { kind: "progress", value: progress }, await viewerToday());
  if (!entry) patch.status = total && progress >= total ? "COMPLETED" : "CURRENT";
  await anilistManga.updateList(user.anilistId, token, anilistId, patch);
  return { anilistId, progress: patch.progress ?? progress };
}

/**
 * "Continue reading": manga you're reading on AniList (Reading or Rereading) that Mangarr has the next chapter of.
 * Each card opens that chapter. Empty without AniList or Mangarr.
 */
export async function continueReading(user: User): Promise<Card[]> {
  const token = anilistToken(user);
  const s = (await getSettings()).mangarr;
  if (!token || !user.anilistId || !s.url) return [];
  const api = mangarr(s);
  const [list, shelf] = await Promise.all([anilistManga.userList(user.anilistId, token).catch(() => null), api.allSeries().catch(() => [])]);
  if (!list) return [];
  const have = new Set(shelf.filter((m) => m.chaptersOnDisk > 0).map((m) => m.anilistId));
  const reading = [...list.values()]
    .filter((e) => (e.status === "CURRENT" || e.status === "REPEATING") && have.has(e.mediaId))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20);
  const cards = await Promise.all(
    reading.map(async (e): Promise<Card | null> => {
      const chapters = await api.chapters(e.mediaId).catch(() => []);
      const next = nextChapter(e.progress, chapters);
      if (next === null) return null;
      const last = Math.max(...chapters.filter((c) => c.onDisk).map((c) => c.number));
      return {
        kind: "manga",
        id: e.mediaId,
        title: aniTitle(e.media.title),
        poster: e.media.coverImage.extraLarge ?? e.media.coverImage.large,
        year: null,
        href: `/read/${e.mediaId}/${next}`,
        sub: e.progress ? `Chapter ${next} next` : `Start with chapter ${next}`,
        watched: last > 0 ? Math.min(1, e.progress / last) : 0,
      };
    }),
  );
  return cards.filter((c): c is Card => c !== null);
}

/**
 * Library → Manga: everything Mangarr has chapters of, as library cards. With AniList linked, the play button opens
 * the next chapter after your progress and the badge counts the downloaded chapters you haven't read.
 */
export async function mangaShelf(user: User): Promise<(LibraryItem & { added: number })[]> {
  const s = (await getSettings()).mangarr;
  if (!s.url) return [];
  const api = mangarr(s);
  const token = anilistToken(user);
  const [all, list] = await Promise.all([
    api.allSeries(),
    token && user.anilistId ? anilistManga.userList(user.anilistId, token).catch(() => null) : null,
  ]);
  const have = all.filter((m) => m.chaptersOnDisk > 0);
  return Promise.all(
    have.map(async (m): Promise<LibraryItem & { added: number }> => {
      const chapters = await api.chapters(m.anilistId).catch(() => []);
      const onDisk = chapters.filter((c) => c.onDisk).map((c) => c.number);
      const progress = list?.get(m.anilistId)?.progress ?? 0;
      const next = nextChapter(progress, chapters) ?? Math.min(...onDisk);
      const last = Math.max(...onDisk);
      return {
        id: String(m.anilistId),
        type: "Manga",
        title: m.title,
        year: null,
        poster: m.cover,
        href: `/manga/${m.anilistId}`,
        playHref: `/read/${m.anilistId}/${next}`,
        played: !!list && progress >= last,
        progress: list && last > 0 ? Math.min(1, progress / last) : null,
        unplayed: list ? onDisk.filter((n) => Math.floor(n) > progress).length : null,
        episode: null,
        rating: null,
        overview: aniDescription(m.description, { oneParagraph: true }) || null,
        backdrop: m.banner,
        added: m.added,
      };
    }),
  );
}
