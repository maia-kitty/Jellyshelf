import { LibraryGrid } from "@/components/LibraryCard";
import { soft } from "@/lib/cards";
import { mangaShelf } from "@/lib/mangaProgress";
import { pageUser } from "@/lib/page";

/** Library → Manga: what Mangarr has downloaded, readable here (and in Mihon). */
export default async function MangaLibrary() {
  const user = await pageUser();
  const items = (await soft(mangaShelf(user), [], "manga shelf")).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">Manga</h2>
        <span className="text-sm text-muted">
          {items.length} title{items.length === 1 ? "" : "s"}
        </span>
      </div>
      {items.length ? (
        <LibraryGrid items={items} />
      ) : (
        <p className="py-16 text-center text-muted">Nothing downloaded yet. Request a manga and it shows up here once its first chapters are in.</p>
      )}
    </>
  );
}
