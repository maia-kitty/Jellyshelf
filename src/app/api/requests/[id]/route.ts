import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { decideRequest, releaseMedia } from "@/lib/requests/decide";
import { deleteRequested } from "@/lib/manage";
import { sentOn } from "@/lib/requestScope";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ action: z.enum(["approve", "decline", "retry"]) });

export function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const admin = await apiUser({ admin: true });
    const { action } = body.parse(await req.json());
    return decideRequest(Number((await params).id), admin, action === "decline" ? "decline" : "approve");
  });
}

/**
 * Users may withdraw their own pending requests; admins may remove any. Once a request has been sent on, removing it
 * deletes the title from Sonarr/Radarr, files and all (and every request for it), as Settings → Manage library does.
 */
export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await apiUser();
    const id = Number((await params).id);
    const [r] = await db.select().from(schema.requests).where(eq(schema.requests.id, id));
    if (!r) throw new ApiError(404, "Request not found");
    if (user.role !== "admin" && (r.userId !== user.id || r.status !== "pending")) throw new ApiError(403, "Not allowed");
    if (sentOn(r) && (await deleteRequested(r.target, r.targetId))) return { ok: true };
    await db.delete(schema.requests).where(eq(schema.requests.id, id));
    await releaseMedia(r.mediaId);
    return { ok: true };
  });
}
