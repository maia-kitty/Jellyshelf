import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";

process.env.CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jellyshelf-manage-"));
vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ sonarr: { url: "http://sonarr:8989", apiKey: "k" }, radarr: { url: "", apiKey: "" }, jellyfin: { url: "", apiKey: "" } }),
}));
const { db, ensureMigrated, schema } = await import("@/db");
const { deleteTitle } = await import("./manage");

it("deletes the series with its files, its requests, and Jellyshelf's link to it", async () => {
  await ensureMigrated();
  const [user] = await db.insert(schema.users).values({ displayName: "a", role: "admin" }).returning();
  const [m] = await db.insert(schema.media).values({ kind: "tv", title: "Show", tmdbId: 1, tvdbId: 500, sonarrId: 7, status: "available" }).returning();
  const [other] = await db.insert(schema.media).values({ kind: "tv", title: "Other", tmdbId: 2, tvdbId: 501, sonarrId: 8, status: "available" }).returning();
  await db.insert(schema.requests).values([
    { mediaId: m.id, userId: user.id, status: "completed", target: "sonarr", targetId: 500 },
    { mediaId: other.id, userId: user.id, status: "completed", target: "sonarr", targetId: 501 },
  ]);
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return new Response(url.endsWith("/series/7") ? JSON.stringify({ id: 7, tvdbId: 500 }) : "", { status: 200 });
    }),
  );

  await deleteTitle("sonarr", 7);

  expect(calls).toEqual(["GET http://sonarr:8989/api/v3/series/7", "DELETE http://sonarr:8989/api/v3/series/7?deleteFiles=true&addImportListExclusion=false"]);
  expect((await db.select().from(schema.requests)).map((r) => r.targetId)).toEqual([501]);
  const [after] = await db.select().from(schema.media).where(eq(schema.media.id, m.id));
  expect(after).toMatchObject({ status: "unknown", sonarrId: null });
  expect((await db.select().from(schema.media).where(eq(schema.media.id, other.id)))[0]).toMatchObject({ status: "available", sonarrId: 8 });
});
