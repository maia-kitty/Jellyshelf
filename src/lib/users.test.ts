import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

// A throwaway database: CONFIG_DIR is read when @/db is first imported.
process.env.CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jellyshelf-test-"));
const { db, ensureMigrated, schema } = await import("@/db");
const { mergeAnilistAccount } = await import("./users");

beforeAll(() => ensureMigrated());

describe("mergeAnilistAccount", () => {
  it("moves requests and ratings to the Jellyfin account, keeps admin, and removes the AniList-only one", async () => {
    const [old] = await db.insert(schema.users).values({ displayName: "old-anilist-user", role: "admin", anilistId: 1234567, autoApproveAnime: true }).returning();
    const [jf] = await db.insert(schema.users).values({ displayName: "jellyfin-user", jellyfinUserId: "abc", role: "user" }).returning();
    const [media] = await db.insert(schema.media).values({ kind: "anime", title: "Frieren", anilistId: 154587 }).returning();
    await db.insert(schema.requests).values({ mediaId: media.id, userId: old.id, decidedBy: old.id, target: "sonarr", targetId: 1, status: "approved" });
    await db.insert(schema.ratings).values({ userId: old.id, anilistId: 154587, title: "Frieren", scores: {}, total: 90, ratedOn: "2026-10-01" });

    await mergeAnilistAccount(old, jf, { anilistId: 1234567, anilistToken: "t" });

    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ id: jf.id, displayName: "jellyfin-user", jellyfinUserId: "abc", anilistId: 1234567, role: "admin", autoApproveAnime: true });
    const [req] = await db.select().from(schema.requests);
    expect(req).toMatchObject({ userId: jf.id, decidedBy: jf.id });
    expect(await db.select().from(schema.ratings).where(eq(schema.ratings.userId, jf.id))).toHaveLength(1);
  });
});
