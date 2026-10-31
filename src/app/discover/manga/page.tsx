import { CardGrid } from "@/components/MediaCard";
import { Pager, Tabs } from "@/components/Tabs";
import { BrowseHeader } from "@/components/BrowseHeader";
import { anilistManga } from "@/lib/clients/anilist";
import { decorate, mangaCard } from "@/lib/cards";
import { pageUser, param, type SearchParams } from "@/lib/page";

export default async function MangaDiscover({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser();
  const sp = await searchParams;
  const list = param(sp, "list") ?? "trending";
  const page = Math.max(1, Math.floor(Number(param(sp, "page"))) || 1);

  const res = list === "popular" ? await anilistManga.popular({ page, perPage: 42 }) : await anilistManga.trending({ page, perPage: 42 });
  const cards = await decorate(res.media.map(mangaCard), user);

  return (
    <>
      <BrowseHeader active="manga" />
      <Tabs
        active={list}
        tabs={[
          { key: "trending", label: "Trending", href: "/discover/manga" },
          { key: "popular", label: "All-time popular", href: "/discover/manga?list=popular" },
        ]}
      />
      <CardGrid cards={cards} />
      <Pager page={page} hasNext={res.pageInfo.hasNextPage} href={(p) => `/discover/manga?list=${list}&page=${p}`} />
    </>
  );
}
