import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Hero } from "@/components/Hero";
import { CommunityScore } from "@/components/Score";
import { RequestManga } from "@/components/RequestButtons";
import { ChapterList } from "@/components/Chapters";
import { JellyfinButton } from "@/components/Episodes";
import { AniListPanel } from "@/components/AniListPanel";
import { CardRow } from "@/components/MediaCard";
import { anilistManga, aniTitle, FORMAT_LABEL } from "@/lib/clients/anilist";
import { mangarr, type MangarrSeries } from "@/lib/clients/mangarr";
import { decorate, mangaCard } from "@/lib/cards";
import { findMedia } from "@/lib/media";
import { pageUser } from "@/lib/page";
import { getSettings } from "@/lib/settings";
import { aniDescription } from "@/lib/text";
import { mangaStuck } from "@/lib/jobs/availability";
import { anilistToken } from "@/lib/auth";
import { nextChapter } from "@/lib/mangaProgress";

const STATUS: Record<string, string> = { RELEASING: "Releasing", FINISHED: "Finished", HIATUS: "On hiatus", CANCELLED: "Cancelled", NOT_YET_RELEASED: "Not out yet" };

async function MoreLikeThis({ id, user }: { id: number; user: Awaited<ReturnType<typeof pageUser>> }) {
  const recs = await anilistManga.recommendations(id).catch(() => []);
  return <CardRow title="More like this" cards={await decorate(recs.slice(0, 20).map(mangaCard), user)} />;
}

/** Where a request is up to, in a line under the buttons. */
function StatusLine({ series, pending, approved }: { series: MangarrSeries | null; pending: boolean; approved: boolean }) {
  if (series) {
    const why = mangaStuck(series);
    if (why) return <p className="text-sm text-warn">{why}</p>;
    if (series.chaptersMissing)
      return (
        <p className="text-sm text-muted">
          {series.chaptersOnDisk} chapters here, {series.chaptersMissing} on the way{series.sourceName ? ` from ${series.sourceName}` : ""}.
        </p>
      );
    if (series.state === "matching") return <p className="text-sm text-muted">Mangarr is looking for a source…</p>;
    if (!series.chaptersOnDisk) return null;
    const all = series.chaptersOnDisk === 1 ? "The chapter is here" : `All ${series.chaptersOnDisk} chapters are here`;
    // A finished manga gets no new chapters; only say so for one that's still coming out.
    return <p className="text-sm text-muted">{all}.{series.anilistStatus === "FINISHED" ? "" : " New ones download as they come out."}</p>;
  }
  if (approved) return <p className="text-sm text-muted">Approved: Mangarr is on it.</p>;
  if (pending) return <p className="text-sm text-muted">Requested: waiting for an admin to approve it.</p>;
  return null;
}

export default async function MangaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const settings = (await getSettings()).mangarr;
  const api = settings.url ? mangarr(settings) : null;
  const [m, media, series, chapters] = await Promise.all([
    anilistManga.media(id),
    findMedia({ kind: "manga", anilistId: id }),
    api ? api.series(id).catch(() => null) : null,
    // all: the chapter list's "show missing" also lists chapters that were never requested.
    api ? api.chapters(id, true).catch(() => []) : [],
  ]);
  if (!m) notFound();
  const requests = media ? await db.select().from(schema.requests).where(eq(schema.requests.mediaId, media.id)) : [];
  const active = requests.filter((r) => r.status === "pending" || r.status === "approved" || r.status === "completed");
  const token = anilistToken(user);
  const entry = token && user.anilistId ? (await anilistManga.userList(user.anilistId, token).catch(() => null))?.get(id) : undefined;
  // Pick up after your AniList progress; from the start when there's none (or you've read everything that's here).
  const resume = entry?.progress ? nextChapter(entry.progress, chapters) : null;
  const first = resume ?? chapters.find((c) => c.onDisk)?.number;
  const authors = [...new Set(m.staff.edges.filter((e) => /story|art/i.test(e.role)).map((e) => e.node.name.full))].join(", ");

  return (
    <>
      <Hero
        title={aniTitle(m.title)}
        original={m.title.native ?? m.title.romaji}
        poster={m.coverImage.extraLarge ?? m.coverImage.large}
        backdrop={m.bannerImage}
        accentColor={m.coverImage.color}
        facts={[
          m.startDate?.year?.toString(),
          m.format && FORMAT_LABEL[m.format],
          m.chapters ? `${m.chapters} chapters` : m.status && STATUS[m.status],
          m.volumes ? `${m.volumes} volumes` : null,
          authors || null,
          m.averageScore ? <CommunityScore score={m.averageScore} percent /> : null,
        ]}
        genres={m.genres}
        overview={aniDescription(m.description)}
        status={media?.status}
        list={entry ? { status: entry.status, progress: entry.progress, total: m.chapters, reading: true } : undefined}
        aside={
          token && user.anilistId ? (
            <AniListPanel
              manga
              mediaId={id}
              title={aniTitle(m.title)}
              episodes={m.status === "FINISHED" ? m.chapters : null}
              aired={null}
              entry={entry ? { status: entry.status, progress: entry.progress, score: entry.score } : null}
              linked
              rating={null}
            />
          ) : undefined
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            {first !== undefined && <JellyfinButton href={`/read/${id}/${first}`} label={resume !== null ? `Continue ch. ${resume}` : "Read"} />}
            {/* Like an anime's: there until every chapter is asked for (Mangarr then follows new ones on its own). */}
            {settings.url && (!series || chapters.some((c) => !c.wanted)) && (
              <RequestManga
                anilistId={id}
                have={!!series}
                done={(series ? active.some((r) => r.status === "pending") : active.length > 0) ? "Requested" : undefined}
              />
            )}
          </div>
          {!settings.url && user.role === "admin" && <p className="text-sm text-muted">Manga downloads aren&apos;t set up yet (Settings → Mangarr).</p>}
          <StatusLine series={series} pending={active.some((r) => r.status === "pending")} approved={active.some((r) => r.status === "approved")} />
        </div>
      </Hero>
      <ChapterList
        mangaId={id}
        chapters={chapters}
        anilist={entry ? { progress: entry.progress } : null}
        // The earliest chapter a request still waiting for approval asks for: those say "requested".
        requestedFrom={(() => {
          const pending = active.filter((r) => r.status === "pending");
          return pending.length ? Math.min(...pending.map((r) => r.startChapter ?? 0)) : null;
        })()}
      />
      <Suspense fallback={null}>
        <MoreLikeThis id={id} user={user} />
      </Suspense>
    </>
  );
}
