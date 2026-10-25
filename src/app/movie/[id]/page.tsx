import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutoHeight } from "@/components/AutoHeight";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { JarLoader } from "@/components/AppIcon";
import { Hero } from "@/components/Hero";
import { CommunityScore } from "@/components/Score";
import { CardRow } from "@/components/MediaCard";
import { MovieRequest } from "@/components/RequestButtons";
import { JellyfinButton } from "@/components/Episodes";
import { FileCard } from "@/components/FileCard";
import { DetailsPanel } from "@/components/DetailsPanel";
import { LibraryStatus } from "@/components/LibraryStatus";
import { SourceSwitch } from "@/components/SourceSwitch";
import { looksLikeAnime, tmdbClient, tmdbImage, type TmdbMovieDetails } from "@/lib/clients/tmdb";
import { HttpError } from "@/lib/clients/http";
import { decorate, movieCard } from "@/lib/cards";
import { anilistForFilm } from "@/lib/mapping";
import { findMedia } from "@/lib/media";
import { pageUser } from "@/lib/page";
import { resumeHint } from "@/lib/playback";
import { movieInfo, type MovieLibraryInfo } from "@/lib/episodes";
import { langName } from "@/lib/langs";

const runtime = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
const longDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const money = (n?: number) => (n ? `$${n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${Math.round(n / 1e6)}M`}` : null);

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const id = Number((await params).id);
  const [movie, media] = await Promise.all([
    tmdbClient.movie(id).catch((e) => {
      if (e instanceof HttpError && e.status === 404) notFound();
      throw e;
    }),
    findMedia({ kind: "movie", tmdbId: id }),
  ]);
  const active = media
    ? await db
        .select()
        .from(schema.requests)
        .where(and(eq(schema.requests.mediaId, media.id), inArray(schema.requests.status, ["pending", "approved", "completed"])))
    : [];
  // Started now, awaited by the parts that need it, so the hero doesn't wait on Radarr/Jellyfin/Bazarr.
  const library = movieInfo({ tmdbId: id, itemId: media?.jellyfinItemId ?? null, radarrId: media?.radarrId ?? null }).catch(() => null);

  const [anilistId, recs] = await Promise.all([
    looksLikeAnime(movie) ? anilistForFilm(movie) : null,
    decorate((movie.recommendations?.results ?? []).slice(0, 20).map(movieCard), user),
  ]);
  const available = media?.status === "available";

  return (
    <>
      <Hero
        title={movie.title}
        original={movie.original_title}
        poster={tmdbImage(movie.poster_path, "w500")}
        backdrop={tmdbImage(movie.backdrop_path, "original")}
        facts={[movie.release_date?.slice(0, 4), movie.runtime ? runtime(movie.runtime) : null, movie.vote_average ? <CommunityScore score={Math.round(movie.vote_average * 10)} percent /> : null]}
        genres={movie.genres.map((g) => g.name)}
        overview={movie.overview}
        status={media?.status}
        aside={<MovieDetails movie={movie} />}
      >
        <SourceSwitch active="tmdb" anilist={anilistId ? `/anime/${anilistId}` : null} tmdb={`/movie/${id}`} />
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            {/* In the library, the thing to do is watch it; otherwise, request it. */}
            <Suspense fallback={null}>
              <PlayButton library={library} user={user} />
            </Suspense>
            {!available && <MovieRequest tmdbId={id} status={media?.status ?? "unknown"} requested={active.length > 0} />}
          </div>
          <LibraryStatus requests={active} media={media} inLibrary={available} />
        </div>
      </Hero>

      <AutoHeight>
        <Suspense fallback={<div className="card mb-10 p-6"><JarLoader width={200} label="Checking the library…" /></div>}>
          <LibraryCard library={library} title={movie.title} user={user} />
        </Suspense>
      </AutoHeight>
      <CardRow title="More like this" cards={recs} />
    </>
  );
}

async function PlayButton({ library, user }: { library: Promise<MovieLibraryInfo | null>; user: User }) {
  const href = (await library)?.playUrl ?? null;
  return <JellyfinButton href={href} resume={await resumeHint(user, href)} />;
}

async function LibraryCard({ library, title, user }: { library: Promise<MovieLibraryInfo | null>; title: string; user: User }) {
  const info = await library;
  if (!info?.file) return null;
  return (
    <div className="mb-10">
      <FileCard info={info} title={title} user={user} />
    </div>
  );
}

function MovieDetails({ movie }: { movie: TmdbMovieDetails }) {
  const imdb = movie.external_ids?.imdb_id;
  return (
    <DetailsPanel
      facts={[
        ["Released", movie.release_date ? longDate(movie.release_date) : null],
        ["Runtime", movie.runtime ? runtime(movie.runtime) : null],
        ["Language", movie.original_language ? langName(movie.original_language) : null],
        ["Studio", movie.production_companies?.slice(0, 2).map((c) => c.name).join(", ")],
        ["Budget", money(movie.budget)],
        ["Box office", money(movie.revenue)],
        ["Status", movie.status !== "Released" ? movie.status : null],
      ]}
      links={[{ label: "TMDB", href: `https://www.themoviedb.org/movie/${movie.id}` }, ...(imdb ? [{ label: "IMDb", href: `https://www.imdb.com/title/${imdb}` }] : [])]}
    />
  );
}
