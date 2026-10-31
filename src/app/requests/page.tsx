import { mediaPath } from "@/lib/notify";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { RequestList } from "@/components/RequestList";
import { sentOn } from "@/lib/requestScope";
import { downloadQueues, progressFor } from "@/lib/downloads";
import { Tabs } from "@/components/Tabs";
import { getSettings } from "@/lib/settings";
import { pageUser, param, type SearchParams } from "@/lib/page";
import { bazarrApi, requestSubs } from "@/lib/subtitles";

export default async function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser();
  const rows = await db
    .select({ request: schema.requests, media: schema.media, user: { id: schema.users.id, displayName: schema.users.displayName } })
    .from(schema.requests)
    .innerJoin(schema.media, eq(schema.media.id, schema.requests.mediaId))
    .innerJoin(schema.users, eq(schema.users.id, schema.requests.userId))
    .where(user.role === "admin" ? undefined : eq(schema.requests.userId, user.id))
    .orderBy(desc(schema.requests.createdAt))
    .limit(300);
  // Admins land on whatever needs them (pending, then failed); otherwise everything.
  const needsAdmin = user.role === "admin" ? (["pending", "failed"] as const).find((s) => rows.some((r) => r.request.status === s)) : undefined;
  const filter = param(await searchParams, "filter") ?? needsAdmin ?? "all";
  const queues = rows.some((r) => r.request.status === "approved") ? await downloadQueues() : null;
  const visible = rows.filter((r) => filter === "all" || r.request.status === filter);
  // Subtitles only matter once something's on disk.
  const hasFiles = (r: (typeof rows)[number]) =>
    r.request.status === "completed" || (r.request.status === "approved" && ["available", "partially_available"].includes(r.media.status));
  const subs = (await bazarrApi())
    ? await Promise.all(visible.map((r) => (hasFiles(r) ? requestSubs(r.request, r.media).catch(() => null) : null)))
    : visible.map(() => null);
  const count = (s: string) => rows.filter((r) => r.request.status === s).length;

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{user.role === "admin" ? "Requests" : "My requests"}</h1>
      <Tabs
        active={filter}
        tabs={[
          { key: "pending", label: `Pending · ${count("pending")}`, href: "/requests?filter=pending" },
          { key: "approved", label: `Processing · ${count("approved")}`, href: "/requests?filter=approved" },
          { key: "failed", label: `Failed · ${count("failed")}`, href: "/requests?filter=failed" },
          { key: "completed", label: `Completed · ${count("completed")}`, href: "/requests?filter=completed" },
          { key: "all", label: "All", href: "/requests?filter=all" },
        ]}
      />
      <RequestList
        isAdmin={user.role === "admin"}
        qbit={!!(await getSettings()).qbittorrent.url}
        userId={user.id}
        rows={visible.map((r, i) => ({
          id: r.request.id,
          status: r.request.status,
          error: r.request.error,
          createdAt: r.request.createdAt.toISOString(),
          target: r.request.target,
          // From every request, not just this tab's: they all go with it.
          sharedWith: rows
            .filter((o) => o.request.id !== r.request.id && o.request.target === r.request.target && o.request.targetId === r.request.targetId && sentOn(o.request))
            .map((o) => `${o.media.title} (${o.user.displayName})`),
          seasons: r.request.seasons,
          episodeRanges: r.request.episodeRanges,
          absolute: r.request.absolute,
          startChapter: r.request.startChapter,
          download: queues && r.request.status === "approved" ? progressFor(r.request, r.media, queues) : null,
          subs: subs[i],
          media: {
            kind: r.media.kind,
            title: r.media.title,
            poster: r.media.poster,
            status: r.media.status,
            href: mediaPath(r.media),
          },
          user: r.user,
        }))}
      />
    </>
  );
}
