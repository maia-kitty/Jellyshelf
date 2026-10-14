import { RatingsTable } from "@/components/RatingsTable";
import { anilistToken } from "@/lib/auth";
import { pageUser } from "@/lib/page";
import { CATEGORIES } from "@/lib/rating";
import { ratingsOverview } from "@/lib/ratings";

export default async function RatingsPage() {
  const user = await pageUser();
  const { rows, unlinked } = await ratingsOverview(user);
  const canPush = !!anilistToken(user);
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Ratings</h1>
        <p className="text-sm text-muted">
          {canPush ? "Your scores from AniList, with your rubric breakdown where you have one." : "Link AniList to see your AniList scores here."}{" "}
          Rate from any anime page.
        </p>
      </div>
      <RatingsTable
        canPush={canPush}
        categories={CATEGORIES.map((c) => ({ name: c.name, max: c.max }))}
        rows={rows}
        unlinked={unlinked.map((r) => ({ id: r.id, title: r.title, total: r.total, ratedOn: r.ratedOn }))}
      />
    </>
  );
}
