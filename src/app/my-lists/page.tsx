import Link from "next/link";
import { CardGrid, MediaCard } from "@/components/MediaCard";
import { ProgressBump } from "@/components/ListEditor";
import { Tabs } from "@/components/Tabs";
import { anilist, type AniListStatus } from "@/lib/clients/anilist";
import { anilistToken } from "@/lib/auth";
import { animeCard, decorate } from "@/lib/cards";
import { pageUser, param, type SearchParams } from "@/lib/page";
import { listRatings } from "@/lib/ratings";

const STATUSES: { key: AniListStatus; label: string }[] = [
  { key: "CURRENT", label: "Watching" },
  { key: "PLANNING", label: "Planning" },
  { key: "PAUSED", label: "Paused" },
  { key: "REPEATING", label: "Rewatching" },
  { key: "COMPLETED", label: "Completed" },
  { key: "DROPPED", label: "Dropped" },
];

export default async function MyLists({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser();
  const sp = await searchParams;
  const token = anilistToken(user);
  if (!token || !user.anilistId) {
    return (
      <div className="card mx-auto max-w-md p-6 text-center">
        <p className="mb-4">Link your AniList account to see your lists here.</p>
        <a className="btn-primary" href="/api/auth/anilist">
          Connect AniList
        </a>
      </div>
    );
  }
  const status = (param(sp, "status") ?? "PLANNING") as AniListStatus;
  const missingOnly = param(sp, "missing") === "1";
  const [list, ratings] = await Promise.all([anilist.userList(user.anilistId, token), listRatings(user.id)]);
  const entries = [...list.values()].filter((e) => e.status === status);
  // Your score: what's on AniList, else your latest rubric rating (rated here but not pushed). Newest first, so first wins.
  const rubric = new Map<number, number>();
  for (const r of ratings) if (r.anilistId && !rubric.has(r.anilistId)) rubric.set(r.anilistId, r.total);
  let cards = (await decorate(entries.map((e) => animeCard(e.media)), user)).map((c) => ({ ...c, mine: list.get(c.id)?.score || rubric.get(c.id) || null }));
  if (missingOnly) cards = cards.filter((c) => !c.status || c.status === "unknown");
  const q = (s: string, m = missingOnly) => `/my-lists?status=${s}${m ? "&missing=1" : ""}`;

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">My AniList</h1>
      <Tabs
        active={status}
        tabs={STATUSES.map((s) => ({
          key: s.key,
          label: `${s.label} · ${[...list.values()].filter((e) => e.status === s.key).length}`,
          href: q(s.key),
        }))}
      />
      <div className="mb-6 flex items-center gap-4 text-sm">
        <Link href={q(status, !missingOnly)} className={missingOnly ? "text-accent" : "text-muted hover:text-fg"}>
          {missingOnly ? "✓ " : ""}Only show what&apos;s not in the library or requested
        </Link>
      </div>
      {status === "CURRENT" || status === "REPEATING" || status === "PAUSED" ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
          {cards.map((c) => {
            const e = list.get(c.id)!;
            return (
              <div key={c.id}>
                <MediaCard card={c} />
                <ProgressBump mediaId={c.id} progress={e.progress} episodes={e.media.episodes} />
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
