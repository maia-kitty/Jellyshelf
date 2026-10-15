import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Media, Request, User } from "@/db/schema";
import { Hero } from "@/components/Hero";
import { CardRow } from "@/components/MediaCard";
import { MovieRequest } from "@/components/RequestButtons";
import { JellyfinButton } from "@/components/Episodes";
import { SubsBar } from "@/components/Subtitles";
import { DownloadBar } from "@/components/DownloadBar";
import { anilist } from "@/lib/clients/anilist";
import { looksLikeAnime, tmdbClient, tmdbImage, type TmdbMovieDetails } from "@/lib/clients/tmdb";
import { HttpError } from "@/lib/clients/http";
import { animeCard, decorate, movieCard, type Card } from "@/lib/cards";
import { anilistIdsFor } from "@/lib/mapping";
import { findMedia } from "@/lib/media";
import { pageUser } from "@/lib/page";
import { movieInfo, type MovieLibraryInfo } from "@/lib/episodes";
import { canFixSubs } from "@/lib/subtitles";
import { downloadQueues, progressFor } from "@/lib/downloads";
import { langName } from "@/lib/langs";

const gb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
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

async function PlayButton({ library }: { library: Promise<MovieLibraryInfo | null> }) {
  const info = await library;
  return <JellyfinButton href={info?.playUrl ?? null} />;
}

/** One labelled fact; cards lay these out in a grid. */
function Tile({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="mb-1 text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function Langs({ codes, empty = "—" }: { codes: string[]; empty?: string }) {
  if (!codes.length) return <span className="text-muted">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {codes.map((c) => (
        <span key={c} className="rounded-md bg-panel-2 px-1.5 py-0.5 text-xs" title={langName(c)}>
          {langName(c)}
        </span>
      ))}
    </span>
  );
}

/** What's on disk (quality, dubs, subtitles), or where the request is up to before there's a file. */
async function LibraryCard({
  library,
  requests,
  media,
  title,
  user,
}: {
  library: Promise<MovieLibraryInfo | null>;
  requests: Request[];
  media: Media | null;
  title: string;
  user: User;
}) {
  const info = await library;
  const file = info?.file;

  if (!file) {
    // Nothing to say until someone has asked for it.
    if (!requests.length) return null;
    const approved = requests.find((r) => r.status === "approved");
    const download = approved && media ? progressFor(approved, media, await downloadQueues()) : null;
    return (
      <section className="card p-5">
        <h3 className="mb-2 font-semibold">Library</h3>
        {download ? (
          <DownloadBar d={download} className="max-w-xl" />
        ) : (
          <p className="text-sm text-muted">{approved ? "Approved — Radarr is looking for a release." : "Requested — waiting for an admin to approve it."}</p>
        )}
      </section>
    );
  }

  const canFix = info.subs ? await canFixSubs(user, info.subs) : false;
  return (
    <section className="card p-5">
      <div className="mb-4 flex min-w-0 items-baseline gap-3">
        <h3 className="shrink-0 font-semibold">In your library</h3>
        {file.name && (
          <span className="truncate text-xs text-muted" title={file.name}>
            {file.name}
          </span>
        )}
      </div>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
        <Tile label="Video">
          <div>{[file.quality, file.hdr].filter(Boolean).join(" · ") || "—"}</div>
          <div className="text-xs text-muted">{[file.resolution, file.videoCodec, gb(file.size)].filter(Boolean).join(" · ")}</div>
        </Tile>
        <Tile label={file.audio.length > 1 ? "Audio · dubs" : "Audio"}>
          <Langs codes={file.audio} empty="Unknown" />
        </Tile>
        <Tile label="Subtitles">
          {info.subs ? <SubsBar subs={info.subs} canFix={canFix} title={title} chips /> : <Langs codes={file.embeddedSubs} empty="None found" />}
        </Tile>
      </dl>
    </section>
  );
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
