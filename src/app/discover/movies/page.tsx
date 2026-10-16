import { CardGrid } from "@/components/MediaCard";
import { Pager, Tabs } from "@/components/Tabs";
import { BrowseHeader } from "@/components/BrowseHeader";
import { tmdbClient } from "@/lib/clients/tmdb";
import { decorate, movieCard } from "@/lib/cards";
import { pageUser, param, type SearchParams } from "@/lib/page";

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
  const res = await (LISTS[list] ?? LISTS.trending).fetch(page);
  const cards = await decorate(res.results.map(movieCard), user);
  return (
    <>
      <BrowseHeader active="movies" />
      <Tabs active={list} tabs={Object.entries(LISTS).map(([key, v]) => ({ key, label: v.label, href: `/discover/movies?list=${key}` }))} />
      <CardGrid cards={cards} />
      <Pager page={page} hasNext={page < Math.min(res.total_pages, 500)} href={(p) => `/discover/movies?list=${list}&page=${p}`} />
    </>
  );
}
