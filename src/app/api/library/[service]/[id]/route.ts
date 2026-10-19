import { z } from "zod";
import { handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { deleteTitle } from "@/lib/manage";

type Ctx = { params: Promise<{ service: string; id: string }> };

const target = z.object({ service: z.enum(["sonarr", "radarr"]), id: z.coerce.number().int().positive() });

/** Settings → Manage library: delete a series or film, files and all. Admins only. */
export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await apiUser({ admin: true });
    const { service, id } = target.parse(await params);
    return { ok: true, note: await deleteTitle(service, id) };
  });
}
