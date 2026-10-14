import { z } from "zod";
import { handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { createRating, listRatings } from "@/lib/ratings";

export function GET() {
  return handle(async () => listRatings((await apiUser()).id));
}

const body = z.object({
  anilistId: z.number().int().positive(),
  scores: z.record(z.string(), z.unknown()),
  push: z.boolean().default(true),
  markCompleted: z.boolean().default(true),
});

export function POST(req: Request) {
  return handle(async () => {
    const user = await apiUser();
    return createRating(user, body.parse(await req.json()));
  });
}
