import { notFound } from "next/navigation";
import { Hero } from "@/components/Hero";
import { CardRow } from "@/components/MediaCard";
import { MovieRequest } from "@/components/RequestButtons";
import { anilist } from "@/lib/clients/anilist";
import { looksLikeAnime, tmdbClient, tmdbImage } from "@/lib/clients/tmdb";
import { HttpError } from "@/lib/clients/http";
import { animeCard, decorate } from "@/lib/cards";
import { anilistIdsFor } from "@/lib/mapping";
import { findMedia } from "@/lib/media";
import { pageUser } from "@/lib/page";
import { Suspense } from "react";
import { JellyfinButton } from "@/components/Episodes";
import { movieInfo } from "@/lib/episodes";
import { canFixSubs } from "@/lib/subtitles";
import { SubsBar } from "@/components/Subtitles";
import type { User } from "@/db/schema";

async function PlayMovie({ tmdbId, itemId, radarrId, title, user }: { tmdbId: number; itemId: string | null; radarrId: number | null; title: string; user: User }) {
  const info = await movieInfo({ tmdbId, itemId, radarrId }).catch(() => null);
  const canFix = info?.subs ? await canFixSubs(user, info.subs) : false;
  return (
    <>
      <JellyfinButton href={info?.playUrl ?? null} />
      {info?.subs && <SubsBar subs={info.subs} canFix={canFix} title={title} className="basis-full" />}
    </>
  );
}
import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const id = Number((await params).id);
  const movie = await tmdbClient.movie(id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const media = await findMedia({ kind: "movie", tmdbId: id });
  const active = media
    ? await db
        .select()
        .from(schema.requests)
        .where(and(eq(schema.requests.mediaId, media.id), inArray(schema.requests.status, ["pending", "approved", "completed"])))
    : [];

  // Anime films: point at the AniList entry so list status/write-back works.
  const anime = looksLikeAnime(movie) ? (await anilistIdsFor({ tmdbMovieId: id })).filter((m) => m.type === "MOVIE") : [];
  const animeCards = anime.length ? await decorate((await anilist.byIds(anime.map((a) => a.anilistId))).map(animeCard), user) : [];

  return (
    <>
      <Hero
        title={movie.title}
        original={movie.original_title}
        poster={tmdbImage(movie.poster_path, "w500")}
        backdrop={tmdbImage(movie.backdrop_path, "original")}
        facts={[movie.release_date?.slice(0, 4), movie.runtime ? `${movie.runtime} min` : null, movie.vote_average ? `★ ${movie.vote_average.toFixed(1)}` : null]}
        genres={movie.genres.map((g) => g.name)}
        overview={movie.overview}
        status={media?.status}
      >
        {animeCards.length ? (
          <p className="text-sm text-muted">
            This is an anime film — request it from its{" "}
            <a className="text-anilist hover:underline" href={animeCards[0].href}>
              AniList page
            </a>{" "}
            to keep your list in sync, or request it here directly.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <MovieRequest tmdbId={id} status={media?.status ?? "unknown"} requested={active.length > 0} />
          <Suspense fallback={null}>
            <PlayMovie tmdbId={id} itemId={media?.jellyfinItemId ?? null} radarrId={media?.radarrId ?? null} title={movie.title} user={user} />
          </Suspense>
        </div>
      </Hero>
      <CardRow title="On AniList" cards={animeCards} />
    </>
  );
}
