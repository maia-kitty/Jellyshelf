import Link from "next/link";
import { LibraryRow } from "@/components/LibraryCard";
import { PlaybackSignIn } from "@/components/PlaybackSignIn";
import { soft } from "@/lib/cards";
import { latestIn, libraryViews } from "@/lib/library";
import { pageUser } from "@/lib/page";
import { canPlay } from "@/lib/playback";

export default async function LibraryHome() {
  const user = await pageUser();
  if (!canPlay(user)) return <PlaybackSignIn user={user} what="browse your library" />;
  const views = await libraryViews(user);
  const latest = await Promise.all(views.map((v) => soft(latestIn(user, v.id), [], `latest ${v.name}`)));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-3">
        <h1 className="text-2xl font-bold">Library</h1>
        <div className="flex flex-wrap gap-2">
          {views.map((v) => (
            <Link key={v.id} href={`/library/${v.id}`} className="rounded-full border border-line px-3.5 py-1.5 text-sm text-muted transition hover:border-accent hover:text-fg">
              {v.name}
            </Link>
          ))}
        </div>
      </div>
      {views.map((v, i) => (
        <LibraryRow key={v.id} title={`Latest in ${v.name}`} href={`/library/${v.id}`} items={latest[i]} />
      ))}
      {!views.length && <p className="py-16 text-center text-muted">Your Jellyfin account doesn&apos;t have any libraries.</p>}
    </>
  );
}
