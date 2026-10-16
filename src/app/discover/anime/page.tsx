import { CardGrid } from "@/components/MediaCard";
import { Pager, Tabs } from "@/components/Tabs";
import { BrowseHeader } from "@/components/BrowseHeader";
import { anilist, currentSeason, seasonLabel, shiftSeason, type AniSeason } from "@/lib/clients/anilist";
import { animeCard, decorate } from "@/lib/cards";
import { pageUser, param, type SearchParams } from "@/lib/page";

const SEASONS: AniSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

export default async function AnimeDiscover({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser();
  const sp = await searchParams;
  const list = param(sp, "list") ?? "trending";
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const now = currentSeason();
  const season = (SEASONS.includes(param(sp, "season") as AniSeason) ? param(sp, "season") : now.season) as AniSeason;
  const year = Number(param(sp, "year")) || now.year;

  const res =
    list === "seasonal"
      ? await anilist.seasonal(season, year, { page, perPage: 42 })
      : list === "popular"
        ? await anilist.popular({ page, perPage: 42 })
        : await anilist.trending({ page, perPage: 42 });
  const cards = await decorate(res.media.map(animeCard), user);

  const prev = shiftSeason({ season, year }, -1);
  const next = shiftSeason({ season, year }, 1);
  const href = (p: number) =>
    `/discover/anime?list=${list}${list === "seasonal" ? `&season=${season}&year=${year}` : ""}&page=${p}`;

  return (
    <>
      <BrowseHeader active="anime" />
      <Tabs
        active={list}
        tabs={[
          { key: "trending", label: "Trending", href: "/discover/anime" },
          { key: "seasonal", label: "Seasonal", href: "/discover/anime?list=seasonal" },
          { key: "popular", label: "All-time popular", href: "/discover/anime?list=popular" },
        ]}
      />
      {list === "seasonal" && (
        <div className="mb-6 flex items-center gap-3">
          <a className="btn-ghost" href={`/discover/anime?list=seasonal&season=${prev.season}&year=${prev.year}`}>
            ← {seasonLabel(prev)}
          </a>
          <span className="font-semibold">{seasonLabel({ season, year })}</span>
          <a className="btn-ghost" href={`/discover/anime?list=seasonal&season=${next.season}&year=${next.year}`}>
            {seasonLabel(next)} →
          </a>
        </div>
      )}
      <CardGrid cards={cards} />
      <Pager page={page} hasNext={res.pageInfo.hasNextPage} href={href} />
    </>
  );
}
