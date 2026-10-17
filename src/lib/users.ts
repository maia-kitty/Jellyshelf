import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";

/**
 * Fold a leftover AniList-only account (they can't be created or signed in to any more) into the Jellyfin account
 * that is linking the same AniList user:
 * its requests and ratings move over, the stronger role and auto-approve flags are kept, and the
 * old account is deleted. `link` is the AniList fields to set on the surviving account.
 */
export async function mergeAnilistAccount(from: User, into: User, link: Partial<User>) {
  await db.transaction(async (tx) => {
    await tx.update(schema.requests).set({ userId: into.id }).where(eq(schema.requests.userId, from.id));
    await tx.update(schema.requests).set({ decidedBy: into.id }).where(eq(schema.requests.decidedBy, from.id));
    await tx.update(schema.ratings).set({ userId: into.id }).where(eq(schema.ratings.userId, from.id));
    // Delete first: anilist_id is unique, so the survivor can't take it while the old row still holds it.
    await tx.delete(schema.users).where(eq(schema.users.id, from.id));
    await tx
      .update(schema.users)
      .set({
        ...link,
        role: from.role === "admin" || into.role === "admin" ? "admin" : "user",
        autoApproveMovie: from.autoApproveMovie || into.autoApproveMovie,
        autoApproveTv: from.autoApproveTv || into.autoApproveTv,
        autoApproveAnime: from.autoApproveAnime || into.autoApproveAnime,
      })
      .where(eq(schema.users.id, into.id));
  });
  console.info(`[auth] merged AniList account ${from.id} (${from.displayName}) into ${into.id} (${into.displayName})`);
}
