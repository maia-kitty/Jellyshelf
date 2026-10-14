import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { toCsv } from "@/lib/rating";

/** Same layout as the rating script's ~/anime_ratings.csv. */
export function GET() {
  return handle(async () => {
    const user = await apiUser();
    const rows = await db.select().from(schema.ratings).where(eq(schema.ratings.userId, user.id)).orderBy(asc(schema.ratings.ratedOn), asc(schema.ratings.id));
    return new Response(toCsv(rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="anime_ratings.csv"' },
    });
  });
}
