import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, handle } from "@/lib/api";
import { getSession, isFirstUser } from "@/lib/auth";
import { jellyfin } from "@/lib/clients/jellyfin";
import { HttpError } from "@/lib/clients/http";
import { getSettings } from "@/lib/settings";

const body = z.object({ username: z.string().min(1), password: z.string() });

export function POST(req: Request) {
  return handle(async () => {
    const { username, password } = body.parse(await req.json());
    const s = await getSettings();
    if (!s.jellyfin.url || !s.jellyfin.allowLogin) throw new ApiError(400, "Jellyfin login is not enabled");
    let auth;
    try {
      auth = await jellyfin(s.jellyfin).authenticate(username, password);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) throw new ApiError(401, "Wrong username or password");
      throw e;
    }
    const first = await isFirstUser();
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.jellyfinUserId, auth.User.Id));
    const user =
      existing ??
      (
        await db
          .insert(schema.users)
          .values({
            displayName: auth.User.Name,
            jellyfinUserId: auth.User.Id,
            role: first || auth.User.Policy.IsAdministrator ? "admin" : "user",
            autoApproveMovie: first || s.general.defaultAutoApprove,
            autoApproveTv: first || s.general.defaultAutoApprove,
            autoApproveAnime: first || s.general.defaultAutoApprove,
          })
          .returning()
      )[0];
    const session = await getSession();
    session.userId = user.id;
    await session.save();
    return { ok: true, redirect: s.general.setupComplete ? "/" : "/setup" };
  });
}
