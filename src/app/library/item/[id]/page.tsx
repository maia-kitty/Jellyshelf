import Link from "next/link";
import { notFound } from "next/navigation";
import { Hero } from "@/components/Hero";
import { JellyfinButton } from "@/components/Episodes";
import { PlaybackSignIn } from "@/components/PlaybackSignIn";
import { HttpError } from "@/lib/clients/http";
import { libraryDetail } from "@/lib/library";
import { pageUser } from "@/lib/page";
import { canPlay } from "@/lib/playback";

const JELLY = "linear-gradient(90deg, #aa5cc3, #00a4dc)";

/** For library titles without an AniList/TMDB match: what Jellyfin knows, and its episodes. */
export default async function LibraryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  if (!canPlay(user)) return <PlaybackSignIn user={user} what="browse your library" />;
  const id = (await params).id;
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) notFound();
  const d = await libraryDetail(user, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });

  return (
    <>
      <Hero title={d.title} poster={d.poster} backdrop={d.backdrop} facts={[d.year?.toString(), d.runtime ? `${d.runtime} min` : null, d.type === "Series" ? "Series" : "Movie"]} genres={d.genres} overview={d.overview}>
        <JellyfinButton href={d.playHref} />
      </Hero>
      {d.seasons.map((s) => (
        <section key={s.id} className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">{s.name}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {s.episodes.map((e) => (
              <Link key={e.id} href={`/watch/${e.id}`} className="group flex gap-3 rounded-xl border border-line bg-panel p-2 transition hover:border-accent">
                <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-panel-2">
                  {e.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.thumb} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  )}
                  {e.progress !== null && !e.played && (
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
                      <span className="block h-full" style={{ width: `${Math.round(e.progress * 100)}%`, backgroundImage: JELLY }} />
                    </span>
                  )}
                </span>
                <span className="min-w-0 py-0.5">
                  <span className="block text-xs text-muted">
                    Episode {e.n ?? "?"} {e.played && <span className="text-ok">· watched</span>}
                  </span>
                  <span className="line-clamp-2 text-sm font-medium leading-snug">{e.title}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
