import { notFound } from "next/navigation";
import { Player } from "@/components/player/Player";
import { PlaybackSignIn } from "@/components/PlaybackSignIn";
import { pageUser } from "@/lib/page";
import { canPlay, watchMeta } from "@/lib/playback";
import { HttpError } from "@/lib/clients/http";

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const id = (await params).id;
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) notFound();

  if (!canPlay(user)) return <PlaybackSignIn user={user} />;

  const meta = await watchMeta(user, id).catch((e) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  });
  return <Player key={id} meta={meta} />;
}
