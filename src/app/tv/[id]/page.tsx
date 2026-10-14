import { notFound } from "next/navigation";
import { Hero } from "@/components/Hero";
import { CardRow } from "@/components/MediaCard";
import { TvRequest } from "@/components/RequestButtons";
import { anilist } from "@/lib/clients/anilist";
import { looksLikeAnime, tmdbClient, tmdbImage } from "@/lib/clients/tmdb";
import { HttpError } from "@/lib/clients/http";
import { animeCard, decorate } from "@/lib/cards";
import { anilistIdsFor } from "@/lib/mapping";
import { findMedia, requestedSeasons } from "@/lib/media";
import { pageUser } from "@/lib/page";

export default async function TvPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const id = Number((await params).id);
  const tv = await tmdbClient.tv(id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const media = await findMedia({ kind: "tv", tmdbId: id });
  const requested = new Set(media ? await requestedSeasons(media.id) : []);
  const isAnime = looksLikeAnime(tv);

  const mapped = isAnime ? await anilistIdsFor({ tmdbTvId: id, tvdbId: tv.external_ids?.tvdb_id }) : [];
  const entries = mapped.length ? await anilist.byIds(mapped.map((m) => m.anilistId).slice(0, 50)) : [];
  const order = new Map(mapped.map((m) => [m.anilistId, (m.tvdbSeason ?? 99) * 1000 + m.episodeOffset]));
  entries.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const animeCards = await decorate(entries.map(animeCard), user);

  const seasons = tv.seasons
    .filter((s) => s.episode_count > 0)
    .map((s) => ({
      number: s.season_number,
      name: s.name,
      episodes: s.episode_count,
      status: media?.seasonStatus?.[s.season_number],
      requested: requested.has(s.season_number),
    }));

  return (
    <>
      <Hero
        title={tv.name}
        original={tv.original_name}
        poster={tmdbImage(tv.poster_path, "w500")}
        backdrop={tmdbImage(tv.backdrop_path, "original")}
        facts={[tv.first_air_date?.slice(0, 4), `${tv.number_of_seasons} season${tv.number_of_seasons === 1 ? "" : "s"}`, tv.status, tv.vote_average ? `★ ${tv.vote_average.toFixed(1)}` : null]}
        genres={tv.genres.map((g) => g.name)}
        overview={tv.overview}
        status={media?.status}
      />
      {isAnime && animeCards.length > 0 && (
        <div className="mb-6 rounded-xl border border-anilist/40 bg-anilist/5 p-4 text-sm">
          <strong className="text-anilist">This is anime.</strong> AniList splits it into the entries below; requesting from those
          monitors the exact TVDB season/episodes for each cour and adds them to your AniList list.
        </div>
      )}
      <CardRow title="AniList entries" cards={animeCards} />
      <div className="max-w-2xl">
        {tv.external_ids?.tvdb_id ? (
          <TvRequest tmdbId={id} seasons={seasons} />
        ) : (
          <p className="text-bad">No TVDB id on TMDB — Sonarr can&apos;t add this show.</p>
        )}
      </div>
    </>
  );
}
