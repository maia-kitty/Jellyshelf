import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { parseRatingsCsv } from "@/lib/rating";
import { importRatings } from "@/lib/ratings";

const body = z.object({ csv: z.string().max(5_000_000), autoMatch: z.boolean().default(true) });

export function POST(req: Request) {
  return handle(async () => {
    const user = await apiUser();
    const { csv, autoMatch } = body.parse(await req.json());
    const { rows, errors } = parseRatingsCsv(csv);
    if (!rows.length) throw new ApiError(400, errors[0] ?? "No rows found");
    return { ...(await importRatings(user, rows, autoMatch)), errors };
  });
}
