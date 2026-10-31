import Link from "next/link";
import { notFound } from "next/navigation";
import { mangarr } from "@/lib/clients/mangarr";
import { pageUser } from "@/lib/page";
import { anilistToken } from "@/lib/auth";
import { ChapterDone } from "@/components/ChapterDone";
import { getSettings } from "@/lib/settings";
import { ReaderPages } from "@/components/ReaderPages";
import { anilistManga } from "@/lib/clients/anilist";

/**
 * The manga reader: the chapter's pages as one strip, or two side by side on wide screens (ReaderPages), next chapter
 * at the bottom. Pages come
 * through /api/manga, so the browser never talks to Mangarr. Reaching the end moves AniList progress (ChapterDone).
 */
export default async function Reader({ params }: { params: Promise<{ id: string; chapter: string }> }) {
  const user = await pageUser();
  const p = await params;
  const id = Number(p.id);
  const chapter = Number(p.chapter);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(chapter)) notFound();
  const s = (await getSettings()).mangarr;
  if (!s.url) notFound();
  const api = mangarr(s);
  const [series, chapters, count, info] = await Promise.all([
    api.series(id).catch(() => null),
    api.chapters(id).catch(() => []),
    api.pageCount(id, chapter).catch(() => 0),
    anilistManga.media(id).catch(() => null),
  ]);
  // Japanese manga read right to left; Korean/Chinese ones are mostly long-strip webtoons, best as one strip.
  const country = info?.countryOfOrigin ?? "JP";
  if (!series || !count) notFound();
  const onDisk = chapters.filter((c) => c.onDisk);
  const at = onDisk.findIndex((c) => c.number === chapter);
  const prev = at > 0 ? onDisk[at - 1] : null;
  const next = at >= 0 && at < onDisk.length - 1 ? onDisk[at + 1] : null;
  const nav = (
    <div className="flex items-center justify-between gap-3 text-sm">
      {prev ? (
        <Link prefetch={false} href={`/read/${id}/${prev.number}`} className="btn-ghost">
          ← Ch. {prev.number}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link prefetch={false} href={`/read/${id}/${next.number}`} className="btn-primary">
          Ch. {next.number} →
        </Link>
      ) : (
        <span className="text-muted">Latest chapter</span>
      )}
    </div>
  );

  return (
    <>
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <Link prefetch={false} href={`/manga/${id}`} className="font-semibold hover:underline">
          {series.title}
        </Link>
        <span className="text-muted">
          Chapter {chapter} · {count} pages
        </span>
      </div>
      {nav}
    </div>
    <ReaderPages id={id} chapter={chapter} count={count} rtl={country === "JP"} strip={country === "KR" || country === "CN" || country === "TW"} />
    <div className="mx-auto max-w-3xl">
      <ChapterDone anilistId={id} chapter={chapter} linked={!!(anilistToken(user) && user.anilistId)} />
      {nav}
    </div>
    </>
  );
}
