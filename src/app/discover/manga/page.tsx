import { CardGrid } from "@/components/MediaCard";
import { Pager, Tabs } from "@/components/Tabs";
import { BrowseHeader } from "@/components/BrowseHeader";
import { anilistManga } from "@/lib/clients/anilist";
import { mangarr } from "@/lib/clients/mangarr";
import { decorate, mangaCard, soft, type Card } from "@/lib/cards";
import { getSettings } from "@/lib/settings";
import { pageUser, param, type SearchParams } from "@/lib/page";

/** Everything Mangarr has chapters of: the manga shelf. */
async function shelf(): Promise<Card[]> {
  const s = (await getSettings()).mangarr;
  if (!s.url) return [];
  const all = await soft(mangarr(s).allSeries(), [], "mangarr series");
  return all
    .filter((m) => m.chaptersOnDisk > 0)
    .map((m) => ({
      kind: "manga" as const,
      id: m.anilistId,
      title: m.title,
      poster: m.cover,
      year: null,
      href: `/manga/${m.anilistId}`,
      sub: `${m.chaptersOnDisk} ch${m.chaptersMissing ? ` · ${m.chaptersMissing} coming` : ""}`,
    }));
}

export default async function MangaDiscover({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser();
  const sp = await searchParams;
  const list = param(sp, "list") ?? "trending";
  const page = Math.max(1, Math.floor(Number(param(sp, "page"))) || 1);

  const res = list === "shelf" ? null : list === "popular" ? await anilistManga.popular({ page, perPage: 42 }) : await anilistManga.trending({ page, perPage: 42 });
  const cards = await decorate(res ? res.media.map(mangaCard) : await shelf(), user);

  return (
    <>
      <BrowseHeader active="manga" />
      <Tabs
        active={list}
        tabs={[
          { key: "trending", label: "Trending", href: "/discover/manga" },
          { key: "popular", label: "All-time popular", href: "/discover/manga?list=popular" },
          { key: "shelf", label: "On the shelf", href: "/discover/manga?list=shelf" },
        ]}
      />
      {list === "shelf" && !cards.length && <p className="text-muted">Nothing downloaded yet. Request a manga and it shows up here once its first chapters are in.</p>}
      <CardGrid cards={cards} />
      {res && <Pager page={page} hasNext={res.pageInfo.hasNextPage} href={(p) => `/discover/manga?list=${list}&page=${p}`} />}
    </>
  );
}
