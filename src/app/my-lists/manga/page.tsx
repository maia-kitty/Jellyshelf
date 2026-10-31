import Link from "next/link";
import { CardGrid, MediaCard } from "@/components/MediaCard";
import { ProgressBump } from "@/components/ListEditor";
import { MyAniListTabs } from "@/components/MyAniListTabs";
import { Tabs } from "@/components/Tabs";
import { anilist, anilistManga, type AniListStatus } from "@/lib/clients/anilist";
import { anilistToken } from "@/lib/auth";
import { decorate, mangaCard } from "@/lib/cards";
import { pageUser, param, type SearchParams } from "@/lib/page";
import { redirect } from "next/navigation";

/** The manga list's own statuses, in AniList's manga words. */
const MANGA_TABS: { key: AniListStatus; label: string }[] = [
  { key: "CURRENT", label: "Reading" },
  { key: "PLANNING", label: "Planning" },
  { key: "PAUSED", label: "Paused" },
  { key: "REPEATING", label: "Rereading" },
  { key: "COMPLETED", label: "Completed" },
  { key: "DROPPED", label: "Dropped" },
];

/** My AniList → Manga: your AniList manga list by status, with what's downloaded (Mangarr) marked on each card. */
export default async function MyManga({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser();
  const token = anilistToken(user);
  // Not linked: the Lists tab has the connect prompt.
  if (!token || !user.anilistId) redirect("/my-lists");
  const sp = await searchParams;
  const asked = param(sp, "status") as AniListStatus | undefined;
  const status = MANGA_TABS.some((t) => t.key === asked) ? asked! : "CURRENT";
  const missingOnly = param(sp, "missing") === "1";
  // The anime list only for the counts on the top row, as on the other tabs.
  const [list, animeList] = await Promise.all([anilistManga.userList(user.anilistId, token), anilist.userList(user.anilistId, token).catch(() => null)]);
  const entries = [...list.values()].filter((e) => e.status === status);
  let cards = await decorate(entries.map((e) => mangaCard(e.media)), user);
  if (missingOnly) cards = cards.filter((c) => !c.status || c.status === "unknown");
  const count = (s: AniListStatus) => [...list.values()].filter((e) => e.status === s).length;
  const q = (s: string, m = missingOnly) => `/my-lists/manga?status=${s}${m ? "&missing=1" : ""}`;

  return (
    <>
      <MyAniListTabs active="manga" list={animeList} />
      <Tabs active={status} tabs={MANGA_TABS.map((t) => ({ key: t.key, label: `${t.label} · ${count(t.key)}`, href: q(t.key) }))} />
      <div className="mb-6 flex items-center gap-4 text-sm">
        <Link prefetch={false} href={q(status, !missingOnly)} className={missingOnly ? "text-accent" : "text-muted hover:text-fg"}>
          {missingOnly ? "✓ " : ""}Only show what&apos;s not downloaded or requested
        </Link>
      </div>
      {!cards.length && <p className="text-muted">Nothing here.</p>}
      {status === "CURRENT" || status === "REPEATING" || status === "PAUSED" ? (
        <div className="bounce-y grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
          {cards.map((c) => {
            const e = list.get(c.id)!;
            return (
              <div key={c.id}>
                <MediaCard card={c} />
                <ProgressBump mediaId={c.id} progress={e.progress} episodes={e.media.status === "FINISHED" ? e.media.chapters : null} manga />
              </div>
            );
          })}
        </div>
      ) : (
        <CardGrid cards={cards} />
      )}
    </>
  );
}
