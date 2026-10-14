import type { MediaKind, MediaStatus, User } from "@/db/schema";
import type { AniListStatus, AniMediaCard } from "@/lib/clients/anilist";
import { anilist, aniTitle } from "@/lib/clients/anilist";
import { looksLikeAnime, tmdbImage, type TmdbMovie, type TmdbTv } from "@/lib/clients/tmdb";
import { anilistToken } from "@/lib/auth";
import { statusMap } from "@/lib/media";

export interface Card {
  kind: MediaKind;
  id: number;
  title: string;
  poster: string | null;
  year: number | null;
  href: string;
  /** Small caption, e.g. "TV · 12 eps" */
  sub?: string;
  isAnime?: boolean;
  status?: MediaStatus;
  list?: { status: AniListStatus; progress: number };
}

const year = (d?: string | null) => (d ? Number(d.slice(0, 4)) || null : null);

export function movieCard(m: TmdbMovie): Card {
  return {
    kind: "movie",
    id: m.id,
    title: m.title,
    poster: tmdbImage(m.poster_path),
    year: year(m.release_date),
    href: `/movie/${m.id}`,
    sub: "Movie",
    isAnime: looksLikeAnime(m),
  };
}

export function tvCard(t: TmdbTv): Card {
  return {
    kind: "tv",
    id: t.id,
    title: t.name,
    poster: tmdbImage(t.poster_path),
    year: year(t.first_air_date),
    href: `/tv/${t.id}`,
    sub: "Series",
    isAnime: looksLikeAnime(t),
  };
}

const FORMAT_LABEL: Record<string, string> = {
  TV: "TV",
  TV_SHORT: "TV Short",
  MOVIE: "Movie",
  SPECIAL: "Special",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Music",
};

export function animeCard(a: AniMediaCard): Card {
  const fmt = a.format ? FORMAT_LABEL[a.format] : "Anime";
  return {
    kind: "anime",
    id: a.id,
    title: aniTitle(a.title),
    poster: a.coverImage.extraLarge ?? a.coverImage.large,
    year: a.seasonYear,
    href: `/anime/${a.id}`,
    sub: a.episodes && a.format !== "MOVIE" ? `${fmt} · ${a.episodes} eps` : fmt,
    isAnime: true,
  };
}

/** Attach availability (from our DB) and, for anime, the viewer's AniList list status. */
export async function decorate(cards: Card[], user: User | null): Promise<Card[]> {
  const statuses = await statusMap(cards.map((c) => (c.kind === "anime" ? { kind: c.kind, anilistId: c.id } : { kind: c.kind, tmdbId: c.id })));
  const token = user ? anilistToken(user) : null;
  const list =
    token && user?.anilistId && cards.some((c) => c.kind === "anime")
      ? await anilist.userList(user.anilistId, token).catch(() => null)
      : null;
  return cards.map((c) => {
    const entry = c.kind === "anime" ? list?.get(c.id) : undefined;
    return {
      ...c,
      status: statuses[`${c.kind}:${c.id}`],
      ...(entry ? { list: { status: entry.status, progress: entry.progress } } : {}),
    };
  });
}

/** Discovery rows shouldn't take a whole page down when one upstream API hiccups. */
export async function soft<T>(p: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.warn(`[discover] ${label} failed:`, e instanceof Error ? e.message : e);
    return fallback;
  }
}
