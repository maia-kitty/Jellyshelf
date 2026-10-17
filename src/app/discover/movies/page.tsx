import { CardGrid } from "@/components/MediaCard";
import { Pager, Tabs } from "@/components/Tabs";
import { BrowseHeader } from "@/components/BrowseHeader";
import { tmdbClient } from "@/lib/clients/tmdb";
import { decorate, movieCard } from "@/lib/cards";
import { pageUser, param, type SearchParams } from "@/lib/page";
import { tmdbPaged } from "@/lib/tmdbPaging";

const LISTS = {
  trending: { label: "Trending", fetch: tmdbClient.trendingMovies },
  popular: { label: "Popular", fetch: tmdbClient.popularMovies },
  upcoming: { label: "Upcoming", fetch: tmdbClient.upcomingMovies },
};

export default async function MoviesDiscover({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser();
  const sp = await searchParams;
  const list = (param(sp, "list") ?? "trending") as keyof typeof LISTS;
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  // 42 to a page, like Anime: it fills rows of 2, 3, 6 and 7, so the grid has no gap at the end on phones or desktops.
  const res = await tmdbPaged((LISTS[list] ?? LISTS.trending).fetch, page, 42);
  const cards = await decorate(res.results.map(movieCard), user);
  return (
    <>
      <BrowseHeader active="movies" />
      <Tabs active={list} tabs={Object.entries(LISTS).map(([key, v]) => ({ key, label: v.label, href: `/discover/movies?list=${key}` }))} />
      <CardGrid cards={cards} />
      <Pager page={page} hasNext={res.hasNext} href={(p) => `/discover/movies?list=${list}&page=${p}`} />
    </>
  );
}
