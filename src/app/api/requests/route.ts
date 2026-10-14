import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { createRequestInput, createRequests } from "@/lib/requests/create";

export function GET() {
  return handle(async () => {
    const user = await apiUser();
    const q = db
      .select({ request: schema.requests, media: schema.media, user: { id: schema.users.id, displayName: schema.users.displayName } })
      .from(schema.requests)
      .innerJoin(schema.media, eq(schema.media.id, schema.requests.mediaId))
      .innerJoin(schema.users, eq(schema.users.id, schema.requests.userId))
      .orderBy(desc(schema.requests.createdAt))
      .limit(200);
    return user.role === "admin" ? q : q.where(eq(schema.requests.userId, user.id));
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const user = await apiUser();
    return createRequests(user, createRequestInput.parse(await req.json()));
  });
}
