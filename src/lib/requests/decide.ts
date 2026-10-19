import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Request, User } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { mediaPath, notify } from "@/lib/notify";
import { pushRequest } from "./push";

/** Approve (and push to the *arr) or decline a request. Retrying a failed or stuck request is an approve. */
export async function decideRequest(id: number, admin: User, action: "approve" | "decline"): Promise<Request> {
  const [req] = await db.select().from(schema.requests).where(eq(schema.requests.id, id));
  if (!req) throw new ApiError(404, "Request not found");
  const [media] = await db.select().from(schema.media).where(eq(schema.media.id, req.mediaId));

  if (action === "decline") {
    // Only what hasn't gone to the *arr: declining from a stale page after someone approved it would leave it
    // downloading under a "declined" request.
    if (req.status !== "pending" && req.status !== "failed") throw new ApiError(409, `Request is already ${req.status}`);
    const [row] = await db
      .update(schema.requests)
      .set({ status: "declined", decidedBy: admin.id, updatedAt: new Date() })
      .where(eq(schema.requests.id, id))
      .returning();
    await releaseMedia(media.id);
    if (req.userId !== admin.id) void notify([req.userId], { title: "Request declined", message: media.title, path: "/requests", tags: ["no_entry_sign"] });
    return row;
  }

  // Approving a stuck one (approved, with the reason as its error) runs it again: switches it back on and searches.
  const stuck = req.status === "approved" && !!req.error;
  if (req.status !== "pending" && req.status !== "failed" && !stuck) throw new ApiError(409, `Request is already ${req.status}`);
  try {
    await pushRequest(req, media);
    const [row] = await db
      .update(schema.requests)
      .set({ status: "approved", error: null, decidedBy: admin.id, updatedAt: new Date() })
      .where(eq(schema.requests.id, id))
      .returning();
    // Not for your own (auto-approved) requests, nor a retry of one that was already approved before it failed.
    if (req.userId !== admin.id && req.status === "pending") {
      void notify([req.userId], { title: "Request approved", message: `${media.title}. It's on its way.`, path: mediaPath(media), tags: ["white_check_mark"] });
    }
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

/** A title shown as requested goes back to plain once no request for it is left (declined or withdrawn). */
export async function releaseMedia(mediaId: number) {
  const others = await db
    .select()
    .from(schema.requests)
    .where(and(eq(schema.requests.mediaId, mediaId), inArray(schema.requests.status, ["pending", "approved", "completed"])));
  if (others.length) return;
  await db
    .update(schema.media)
    .set({ status: "unknown" })
    .where(and(eq(schema.media.id, mediaId), eq(schema.media.status, "pending")));
}
