import { notFound, redirect } from "next/navigation";
import { pageUser } from "@/lib/page";
import { canPlay, firstToPlay } from "@/lib/playback";

/** "Play" on a series: whatever's half-watched, else what's next up, else the first episode. */
export default async function PlaySeries({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const id = (await params).id;
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) notFound();
  // Not set up for playback yet: the watch page asks them to sign in, then comes back round to the right episode.
  if (!canPlay(user)) redirect(`/watch/${id}`);
  const ep = await firstToPlay(user, id);
  if (!ep) notFound();
  redirect(`/watch/${ep}`);
}
