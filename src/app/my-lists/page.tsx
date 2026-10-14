import Link from "next/link";
import { CardGrid } from "@/components/MediaCard";
import { Tabs } from "@/components/Tabs";
import { anilist, type AniListStatus } from "@/lib/clients/anilist";
import { anilistToken } from "@/lib/auth";
import { animeCard, decorate } from "@/lib/cards";
import { pageUser, param, type SearchParams } from "@/lib/page";

const STATUSES: { key: AniListStatus; label: string }[] = [
  { key: "CURRENT", label: "Watching" },
  { key: "PLANNING", label: "Planning" },
  { key: "PAUSED", label: "Paused" },
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
  const list = await anilist.userList(user.anilistId, token);
  const entries = [...list.values()].filter((e) => e.status === status);
  let cards = await decorate(entries.map((e) => animeCard(e.media)), user);
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
      <CardGrid cards={cards} />
    </>
  );
}
