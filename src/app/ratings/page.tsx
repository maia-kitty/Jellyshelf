import { RatingsTable } from "@/components/RatingsTable";
import { anilistToken } from "@/lib/auth";
import { pageUser } from "@/lib/page";
import { CATEGORIES } from "@/lib/rating";
import { listRatings } from "@/lib/ratings";

export default async function RatingsPage() {
  const user = await pageUser();
  const rows = await listRatings(user.id);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ratings</h1>
          <p className="text-sm text-muted">
            {CATEGORIES.map((c) => `${c.name} ${c.max}`).join(" · ")} = 100. Rate from any anime page.
          </p>
        </div>
      </div>
      <RatingsTable
        canPush={!!anilistToken(user)}
        categories={CATEGORIES.map((c) => ({ name: c.name, max: c.max }))}
        rows={rows.map((r) => ({
          id: r.id,
          anilistId: r.anilistId,
          title: r.title,
          scores: r.scores,
          total: r.total,
          ratedOn: r.ratedOn,
          pushed: r.pushedToAnilist,
        }))}
      />
    </>
  );
}
