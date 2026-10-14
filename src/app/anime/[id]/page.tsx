import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { User } from "@/db/schema";
import { Hero } from "@/components/Hero";
import { CardRow } from "@/components/MediaCard";
import { AnimeRequest, type AnimeEntryOption } from "@/components/RequestButtons";
import { MappingOverride } from "@/components/MappingOverride";
import { LIST_LABEL } from "@/components/StatusBadge";
import { anilist, aniTitle, franchiseChain, type AniMediaCard } from "@/lib/clients/anilist";
import { anilistToken } from "@/lib/auth";
import { animeCard, decorate } from "@/lib/cards";
import { getMapping, resolveAnime } from "@/lib/mapping";
import { describeTarget } from "@/lib/mapping/resolve";
import { animeMediaMap } from "@/lib/media";
import { pageUser } from "@/lib/page";

function stripHtml(s: string | null) {
  return s
    ?.replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FORMAT: Record<string, string> = { TV: "TV", TV_SHORT: "TV Short", MOVIE: "Movie", SPECIAL: "Special", OVA: "OVA", ONA: "ONA", MUSIC: "Music" };

async function entryOptions(entries: AniMediaCard[], currentId: number, user: User): Promise<AnimeEntryOption[]> {
  const token = anilistToken(user);
  const [mediaMap, list] = await Promise.all([
    animeMediaMap(entries.map((e) => e.id)),
    token && user.anilistId ? anilist.userList(user.anilistId, token).catch(() => null) : null,
  ]);
  return Promise.all(
    entries.map(async (e) => {
      const { target } = await resolveAnime({ id: e.id, format: e.format, episodes: e.episodes });
      const m = mediaMap.get(e.id);
      const l = list?.get(e.id);
      return {
        id: e.id,
        title: aniTitle(e.title),
        sub: [e.seasonYear, e.format && FORMAT[e.format], e.episodes && `${e.episodes} eps`].filter(Boolean).join(" · "),
        target: describeTarget(target),
        mapped: target.service !== "unmapped",
        status: m?.status,
        requested: !!m?.requested,
        current: e.id === currentId,
        list: l ? `${LIST_LABEL[l.status]}${l.status === "CURRENT" ? ` ${l.progress}/${e.episodes ?? "?"}` : ""}` : undefined,
      };
    }),
  );
}

async function Franchise({ entry, user }: { entry: AniMediaCard; user: User }) {
  const chain = await franchiseChain(entry.id).catch(() => []);
  const entries = chain.some((c) => c.id === entry.id) ? chain : [entry];
  return <AnimeRequest entries={await entryOptions(entries, entry.id, user)} />;
}

export default async function AnimePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const id = Number((await params).id);
  const a = await anilist.media(id);
  if (!a) notFound();

  const token = anilistToken(user);
  const list = token && user.anilistId ? await anilist.userList(user.anilistId, token).catch(() => null) : null;
  const entry = list?.get(id);
  const [decorated] = await decorate([animeCard(a)], user);
  const isSeries = a.format !== "MOVIE";

  const related = a.relations.edges
    .filter((e) => e.node.type === "ANIME" && !(isSeries && ["PREQUEL", "SEQUEL"].includes(e.relationType) && e.node.format !== "MOVIE"))
    .map((e) => ({ ...animeCard(e.node), sub: `${e.relationType.replace("_", " ").toLowerCase()} · ${e.node.format ?? ""}` }));
  const relatedCards = await decorate(related, user);

  const mapping = user.role === "admin" ? await getMapping(id) : undefined;
  const airing = a.nextAiringEpisode
    ? `Ep ${a.nextAiringEpisode.episode} airs ${new Date(a.nextAiringEpisode.airingAt * 1000).toLocaleDateString()}`
    : null;

  return (
    <>
      <Hero
        title={aniTitle(a.title)}
        original={a.title.native ?? a.title.romaji}
        poster={a.coverImage.extraLarge ?? a.coverImage.large}
        backdrop={a.bannerImage}
        accentColor={a.coverImage.color}
        facts={[
          a.season && a.seasonYear ? `${a.season[0]}${a.season.slice(1).toLowerCase()} ${a.seasonYear}` : a.seasonYear?.toString(),
          a.format && FORMAT[a.format],
          a.episodes && a.format !== "MOVIE" ? `${a.episodes} episodes` : null,
          a.duration ? `${a.duration} min` : null,
          a.studios.nodes.map((s) => s.name).join(", "),
          a.averageScore ? `★ ${a.averageScore}%` : null,
          airing,
        ]}
        genres={a.genres}
        overview={stripHtml(a.description)}
        status={decorated.status}
        list={entry ? { status: entry.status, progress: entry.progress, total: a.episodes } : undefined}
      >
        <a className="text-sm text-anilist hover:underline" href={`https://anilist.co/anime/${a.id}`} target="_blank" rel="noreferrer">
          Open on AniList ↗
        </a>
      </Hero>

      <div className="mb-10 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Suspense fallback={<AnimeRequest entries={await entryOptions([a], a.id, user)} />}>
          <Franchise entry={a} user={user} />
        </Suspense>
        {user.role === "admin" && (
          <MappingOverride
            anilistId={a.id}
            initial={{
              tvdbId: mapping?.tvdbId ?? null,
              tmdbMovieId: mapping?.tmdbMovieId ?? null,
              tvdbSeason: mapping?.tvdbSeason ?? null,
              episodeOffset: mapping?.episodeOffset ?? 0,
            }}
          />
        )}
      </div>
      <CardRow title="Related" cards={relatedCards} />
    </>
  );
}
