import { notFound } from "next/navigation";
import { LibraryGrid } from "@/components/LibraryCard";
import { PlaybackSignIn } from "@/components/PlaybackSignIn";
import { Pager } from "@/components/Tabs";
import { LibraryControls } from "@/components/LibraryControls";
import { browse, FILTERS, libraryViews, PAGE_SIZE, SORTS, type FilterKey, type SortKey } from "@/lib/library";
import { pageUser, param, type SearchParams } from "@/lib/page";
import { canPlay } from "@/lib/playback";

export default async function LibraryView({ params, searchParams }: { params: Promise<{ viewId: string }>; searchParams: SearchParams }) {
  const user = await pageUser();
  if (!canPlay(user)) return <PlaybackSignIn user={user} what="browse your library" />;
  const viewId = (await params).viewId;
  const sp = await searchParams;
  const sort = (param(sp, "sort") ?? "added") as SortKey;
  const filter = (param(sp, "filter") ?? "all") as FilterKey;
  const page = Math.max(1, Number(param(sp, "page") ?? "1") || 1);
  if (!(sort in SORTS) || !(filter in FILTERS)) notFound();

  const views = await libraryViews(user);
  const view = views.find((v) => v.id === viewId);
  if (!view) notFound();
  const { items, total } = await browse(user, viewId, { sort, filter, page: page - 1 });
  const url = (o: { sort?: string; filter?: string; page?: number }) =>
    `/library/${viewId}?sort=${o.sort ?? sort}&filter=${o.filter ?? filter}${o.page && o.page > 1 ? `&page=${o.page}` : ""}`;

  return (
    <>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">{view.name}</h2>
        <span className="text-sm text-muted">
          {total} title{total === 1 ? "" : "s"}
        </span>
      </div>
      <LibraryControls
        base={`/library/${viewId}`}
        sort={sort}
        filter={filter}
        sorts={Object.entries(SORTS).map(([key, s]) => ({ key, label: s.label }))}
        filters={Object.entries(FILTERS).map(([key, f]) => ({ key, label: f.label }))}
      >
        <LibraryGrid items={items} />
        {total > PAGE_SIZE && <Pager page={page} hasNext={page * PAGE_SIZE < total} href={(p) => url({ page: p })} />}
      </LibraryControls>
    </>
  );
}
