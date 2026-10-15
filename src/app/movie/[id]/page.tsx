import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { Hero } from "@/components/Hero";
import { CardRow } from "@/components/MediaCard";
import { MovieRequest } from "@/components/RequestButtons";
import { JellyfinButton } from "@/components/Episodes";
import { FileCard, Tile } from "@/components/FileCard";
import { anilist } from "@/lib/clients/anilist";
import { looksLikeAnime, tmdbClient, tmdbImage, type TmdbMovieDetails } from "@/lib/clients/tmdb";
import { HttpError } from "@/lib/clients/http";
import { animeCard, decorate, movieCard, type Card } from "@/lib/cards";
import { anilistIdsFor } from "@/lib/mapping";
import { findMedia } from "@/lib/media";
import { pageUser } from "@/lib/page";
import { movieInfo, type MovieLibraryInfo } from "@/lib/episodes";
import { langName } from "@/lib/langs";

const runtime = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);

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
  // Started now, awaited by the parts that need it, so the hero doesn't wait on Radarr/Jellyfin/Bazarr.
  const library = movieInfo({ tmdbId: id, itemId: media?.jellyfinItemId ?? null, radarrId: media?.radarrId ?? null }).catch(() => null);

  // Anime films: point at the AniList entry so list status/write-back works.
  const anime = looksLikeAnime(movie) ? (await anilistIdsFor({ tmdbMovieId: id })).filter((m) => m.type === "MOVIE") : [];
  const animeCards = anime.length ? await decorate((await anilist.byIds(anime.map((a) => a.anilistId))).map(animeCard), user) : [];
  const recs = await decorate((movie.recommendations?.results ?? []).slice(0, 20).map(movieCard), user);
  const available = media?.status === "available";

  return (
    <>
      <Hero
        title={movie.title}
        original={movie.original_title}
        poster={tmdbImage(movie.poster_path, "w500")}
        backdrop={tmdbImage(movie.backdrop_path, "original")}
        facts={[movie.release_date?.slice(0, 4), movie.runtime ? runtime(movie.runtime) : null, movie.vote_average ? `★ ${Math.round(movie.vote_average * 10)}%` : null]}
        genres={movie.genres.map((g) => g.name)}
        overview={movie.overview}
        status={media?.status}
      >
        {animeCards[0] && <AnimeFilmNote card={animeCards[0]} />}
        <div className="flex flex-wrap items-start gap-3">
          {/* In the library, the thing to do is watch it; otherwise, request it. */}
          {!available && <MovieRequest tmdbId={id} status={media?.status ?? "unknown"} requested={active.length > 0} />}
          <Suspense fallback={null}>
            <PlayButton library={library} />
          </Suspense>
        </div>
      </Hero>

      <div className="mb-10 space-y-6">
        <Suspense fallback={null}>
          <LibraryCard library={library} requests={active} media={media ?? null} title={movie.title} user={user} />
        </Suspense>
        <DetailsCard movie={movie} />
      </div>

      <CardRow title="More like this" cards={recs} />
    </>
  );
}

async function LibraryCard({ library, ...rest }: { library: Promise<MovieLibraryInfo | null> } & Omit<React.ComponentProps<typeof FileCard>, "info">) {
  return <FileCard info={await library} {...rest} />;
}

async function PlayButton({ library }: { library: Promise<MovieLibraryInfo | null> }) {
  const info = await library;
  return <JellyfinButton href={info?.playUrl ?? null} />;
}

function DetailsCard({ movie }: { movie: TmdbMovieDetails }) {
  const studios = movie.production_companies?.slice(0, 3).map((c) => c.name).join(", ");
  const money = (n?: number) => (n ? `$${n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${Math.round(n / 1e6)}M`}` : null);
  const facts: [string, string | null | undefined][] = [
    ["Released", movie.release_date ? new Date(movie.release_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null],
    ["Runtime", movie.runtime ? runtime(movie.runtime) : null],
    ["Language", movie.original_language ? langName(movie.original_language) : null],
    ["Studio", studios],
    ["Budget", money(movie.budget)],
    ["Box office", money(movie.revenue)],
    ["Status", movie.status !== "Released" ? movie.status : null],
  ];
  const imdb = movie.external_ids?.imdb_id;
  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-semibold">Details</h3>
        {movie.tagline && <p className="text-sm italic text-muted">“{movie.tagline}”</p>}
      </div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <Tile key={k} label={k}>
              {v}
            </Tile>
          ))}
      </dl>
      <div className="mt-4 flex gap-3 text-sm">
        <a className="text-accent hover:underline" href={`https://www.themoviedb.org/movie/${movie.id}`} target="_blank" rel="noreferrer">
          TMDB ↗
        </a>
        {imdb && (
          <a className="text-accent hover:underline" href={`https://www.imdb.com/title/${imdb}`} target="_blank" rel="noreferrer">
            IMDb ↗
          </a>
        )}
      </div>
    </section>
  );
}

/** Anime films also live on AniList; requesting from there keeps your list in sync. */
function AnimeFilmNote({ card }: { card: Card }) {
  return (
    <a
      href={card.href}
      className="mb-4 inline-block rounded-lg border border-anilist/40 bg-anilist/10 px-3 py-1.5 text-sm transition hover:border-anilist"
    >
      <span className="whitespace-nowrap font-semibold text-anilist">Anime film</span>
      <span className="text-fg/70"> · request it from AniList to keep your list in sync →</span>
    </a>
  );
}
