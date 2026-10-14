import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Request, User } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { pushRequest } from "./push";

/** Approve (and push to the *arr) or decline a request. Retrying a failed request is an approve. */
export async function decideRequest(id: number, admin: User, action: "approve" | "decline"): Promise<Request> {
  const [req] = await db.select().from(schema.requests).where(eq(schema.requests.id, id));
  if (!req) throw new ApiError(404, "Request not found");
  const [media] = await db.select().from(schema.media).where(eq(schema.media.id, req.mediaId));

  if (action === "decline") {
    const [row] = await db
      .update(schema.requests)
      .set({ status: "declined", decidedBy: admin.id, updatedAt: new Date() })
      .where(eq(schema.requests.id, id))
      .returning();
    const others = await db
      .select()
      .from(schema.requests)
      .where(and(eq(schema.requests.mediaId, media.id), inArray(schema.requests.status, ["pending", "approved", "completed"])));
    if (!others.length && media.status === "pending") {
      await db.update(schema.media).set({ status: "unknown" }).where(eq(schema.media.id, media.id));
    }
    return row;
  }

  if (req.status !== "pending" && req.status !== "failed") throw new ApiError(409, `Request is already ${req.status}`);
  try {
    await pushRequest(req, media);
    const [row] = await db
      .update(schema.requests)
      .set({ status: "approved", error: null, decidedBy: admin.id, updatedAt: new Date() })
      .where(eq(schema.requests.id, id))
      .returning();
    return row;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[request ${id}] push failed:`, message);
    const [row] = await db
      .update(schema.requests)
      .set({ status: "failed", error: message, decidedBy: admin.id, updatedAt: new Date() })
      .where(eq(schema.requests.id, id))
      .returning();
    return row;
  }
}
