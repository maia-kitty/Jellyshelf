import { LibraryPanel } from "@/components/LibraryCard";
import { PlaybackSignIn } from "@/components/PlaybackSignIn";
import { soft } from "@/lib/cards";
import { latestIn, libraryViews, type LibraryView } from "@/lib/library";
import { mangaShelf } from "@/lib/mangaProgress";
import { pageUser } from "@/lib/page";
import { canPlay } from "@/lib/playback";

/** Where a library goes in the 2×2: anime and manga on top, shows and movies under them, anything else after. */
function place(v: Pick<LibraryView, "name" | "type">) {
  if (/anime/i.test(v.name)) return 0;
  if (v.type === "tvshows") return 2;
  if (v.type === "movies") return 3;
  return 4;
}

export default async function LibraryHome() {
  const user = await pageUser();
  if (!canPlay(user)) return <PlaybackSignIn user={user} what="browse your library" />;
  const views = await libraryViews(user);
  const [latest, manga] = await Promise.all([
    Promise.all(views.map((v) => soft(latestIn(user, v.id), [], `latest ${v.name}`))),
    soft(mangaShelf(user), [], "latest manga"),
  ]);
  const panels = [
    ...views.map((v, i) => ({ key: v.id, title: `Latest in ${v.name}`, href: `/library/${v.id}`, items: latest[i], at: place(v) })),
    { key: "manga", title: "Latest in Manga", href: "/library/manga", items: manga.sort((a, b) => b.added - a.added).slice(0, 20), at: 1 },
  ]
    .filter((p) => p.items.length)
    .sort((a, b) => a.at - b.at);

  return (
    <>
      <div className="grid gap-x-6 gap-y-10 lg:grid-cols-2">
        {panels.map((p) => (
          <LibraryPanel key={p.key} title={p.title} href={p.href} items={p.items} />
        ))}
      </div>
      {!views.length && <p className="py-16 text-center text-muted">Your Jellyfin account doesn&apos;t have any libraries.</p>}
    </>
  );
}
