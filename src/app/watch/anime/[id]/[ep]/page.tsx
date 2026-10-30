import Link from "next/link";
import { notFound } from "next/navigation";
import { StreamPlayer } from "@/components/player/StreamPlayer";
import { WatchElsewhere } from "@/components/WatchElsewhere";
import { anilist, aniTitle } from "@/lib/clients/anilist";
import { zokoStream } from "@/lib/clients/zoko";
import { pageUser, param, type SearchParams } from "@/lib/page";

/** "Stream now" on an anime page: an episode from the site ani-cli uses, for anything not (yet) in the library. */
export default async function StreamPage({ params, searchParams }: { params: Promise<{ id: string; ep: string }>; searchParams: SearchParams }) {
  await pageUser();
  const id = Number((await params).id);
  const ep = Number((await params).ep);
  if (!Number.isInteger(ep) || ep < 1) notFound();
  const mode = param(await searchParams, "audio") === "dub" ? "dub" : "sub";
  const a = await anilist.media(id);
  if (!a?.idMal) notFound();
  const stream = await zokoStream(a.idMal, ep, mode).catch(() => null);

  const title = aniTitle(a.title);
  const last = a.episodes ?? (a.nextAiringEpisode ? a.nextAiringEpisode.episode - 1 : null);
  const href = (n: number, m = mode) => `/watch/anime/${id}/${n}${m === "dub" ? "?audio=dub" : ""}`;
  const base = `/api/stream/${a.idMal}/${ep}/${mode}`;

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link prefetch={false} href={`/anime/${id}`} className="text-sm text-muted hover:text-fg">
            ← {title}
          </Link>
          <h1 className="text-xl font-bold">Episode {ep}</h1>
        </div>
        <div className="flex gap-2">
          {(["sub", "dub"] as const).map((m) => (
            <Link key={m} prefetch={false} href={href(ep, m)} className={m === mode ? "btn-primary" : "btn-ghost"}>
              {m === "sub" ? "Subbed" : "Dubbed"}
            </Link>
          ))}
        </div>
      </div>

      {stream ? (
        <StreamPlayer key={base} src={`${base}/master.m3u8`} subtitles={stream.subtitles && `${base}/subs.vtt`} />
      ) : (
        <div className="card p-8 text-center text-sm text-muted">
          The stream site doesn&apos;t have episode {ep} {mode === "dub" ? "dubbed" : "subbed"}. <WatchElsewhere title={title} anime label="Try another source" />
        </div>
      )}

      <div className="flex justify-between">
        {ep > 1 ? (
          <Link prefetch={false} href={href(ep - 1)} className="btn-ghost">
            ← Episode {ep - 1}
          </Link>
        ) : (
          <span />
        )}
        {(last === null || ep < last) && (
          <Link prefetch={false} href={href(ep + 1)} className="btn-ghost">
            Episode {ep + 1} →
          </Link>
        )}
      </div>
      <p className="text-xs text-muted">Streamed from ZokoAnime, not your library, so it doesn&apos;t update AniList.</p>
    </div>
  );
}
