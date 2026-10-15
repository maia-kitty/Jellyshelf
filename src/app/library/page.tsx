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
      {views.map((v, i) => (
        <LibraryRow key={v.id} title={`Latest in ${v.name}`} href={`/library/${v.id}`} items={latest[i]} />
      ))}
      {!views.length && <p className="py-16 text-center text-muted">Your Jellyfin account doesn&apos;t have any libraries.</p>}
    </>
  );
}
