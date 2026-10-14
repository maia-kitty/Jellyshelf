import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

const body = z
  .object({
    role: z.enum(["admin", "user"]),
    autoApproveMovie: z.boolean(),
    autoApproveTv: z.boolean(),
    autoApproveAnime: z.boolean(),
  })
  .partial();

export function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const admin = await apiUser({ admin: true });
    const id = Number((await params).id);
    const v = body.parse(await req.json());
    if (id === admin.id && v.role === "user") throw new ApiError(400, "You can't demote yourself");
    const [row] = await db.update(schema.users).set({ ...v, updatedAt: new Date() }).where(eq(schema.users.id, id)).returning();
    if (!row) throw new ApiError(404, "User not found");
    return { id: row.id, role: row.role };
  });
}
