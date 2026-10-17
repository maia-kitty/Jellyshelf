import { RatingsTable } from "@/components/RatingsTable";
import { MyAniListTabs } from "@/components/MyAniListTabs";
import { anilist } from "@/lib/clients/anilist";
import { anilistToken } from "@/lib/auth";
import { pageUser } from "@/lib/page";
import { CATEGORIES } from "@/lib/rating";
import { ratingsOverview } from "@/lib/ratings";

export default async function RatingsPage() {
  const user = await pageUser();
  const token = anilistToken(user);
  const [{ rows, unlinked }, list] = await Promise.all([
    ratingsOverview(user),
    token && user.anilistId ? anilist.userList(user.anilistId, token).catch(() => null) : null,
  ]);
  const canPush = !!token && !!user.anilistId;
  return (
    <>
      <MyAniListTabs active="ratings" list={list} linked={canPush} />
      <div className="mb-6">
        <p className="text-sm text-muted">
          {canPush ? "Your scores from AniList, with your rubric breakdown where you have one." : "Your rubric ratings."} Rate from any anime page.
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
