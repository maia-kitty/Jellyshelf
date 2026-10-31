import { notFound } from "next/navigation";
import { LibraryGrid } from "@/components/LibraryCard";
import { LibraryControls } from "@/components/LibraryControls";
import { soft } from "@/lib/cards";
import { mangaShelf } from "@/lib/mangaProgress";
import { pageUser, param, type SearchParams } from "@/lib/page";

// The same controls as a Jellyfin library, in manga words.
const SORTS = { added: "Recently added", name: "A–Z" } as const;
const FILTERS = { all: "All", unread: "Unread", read: "Read" } as const;

/** Library → Manga: what Mangarr has downloaded, readable here (and in Mihon). Laid out like the other libraries. */
export default async function MangaLibrary({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser();
  const sp = await searchParams;
  const sort = param(sp, "sort") ?? "added";
  const filter = param(sp, "filter") ?? "all";
  if (!Object.hasOwn(SORTS, sort) || !Object.hasOwn(FILTERS, filter)) notFound();
  const all = await soft(mangaShelf(user), [], "manga shelf");
  // Read / unread need AniList (unplayed is null without it).
  const items = all
    .filter((i) => filter === "all" || (filter === "read" ? i.played : !i.played && (i.unplayed ?? 1) > 0))
    .sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : b.added - a.added));

  return (
    <>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">Manga</h2>
        <span className="text-sm text-muted">
          {items.length} title{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <LibraryControls
        base="/library/manga"
        sort={sort}
        filter={filter}
        sorts={Object.entries(SORTS).map(([key, label]) => ({ key, label }))}
        filters={Object.entries(FILTERS).map(([key, label]) => ({ key, label }))}
      >
        {all.length ? (
          <LibraryGrid items={items} />
        ) : (
          <p className="py-16 text-center text-muted">Nothing downloaded yet. Request a manga and it shows up here once its first chapters are in.</p>
        )}
      </LibraryControls>
    </>
  );
}
