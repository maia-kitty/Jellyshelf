import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";

process.env.CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jellyshelf-manage-"));
vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({
    sonarr: { url: "http://sonarr:8989", apiKey: "k" },
    radarr: { url: "", apiKey: "" },
    jellyfin: { url: "", apiKey: "" },
    qbittorrent: { url: "http://qbit:8080", username: "u", password: "p" },
  }),
}));
const { db, ensureMigrated, schema } = await import("@/db");
const { deleteRequested, deleteTitle } = await import("./manage");

const HASH = "ab".repeat(20);

it("deletes the series with its files, its requests, its torrents, and Jellyshelf's link to it", async () => {
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
      calls.push(`${init?.method ?? "GET"} ${url}${url.includes("torrents") ? ` ${init?.body}` : ""}`);
      if (url.includes("/history/series")) return Response.json([{ downloadId: HASH.toUpperCase() }, { downloadId: "SABnzbd_nzo_1" }, { downloadId: HASH.toUpperCase() }]);
      if (url.endsWith("/auth/login")) return new Response("Ok.", { headers: { "Set-Cookie": "SID=s1; HttpOnly" } });
      return new Response(url.endsWith("/series/7") ? JSON.stringify({ id: 7, tvdbId: 500 }) : "", { status: 200 });
    }),
  );

  expect(await deleteTitle("sonarr", 7)).toBeNull();

  expect(calls).toEqual([
    // Its torrents are looked up first: the delete takes the history with it.
    "GET http://sonarr:8989/api/v3/history/series?seriesId=7&eventType=1",
    "GET http://sonarr:8989/api/v3/series/7",
    "DELETE http://sonarr:8989/api/v3/series/7?deleteFiles=true&addImportListExclusion=false",
    "POST http://qbit:8080/api/v2/auth/login",
    // Once each, and not the usenet one.
    `POST http://qbit:8080/api/v2/torrents/delete hashes=${HASH}&deleteFiles=true`,
  ]);
  expect((await db.select().from(schema.requests)).map((r) => r.targetId)).toEqual([501]);
  const [after] = await db.select().from(schema.media).where(eq(schema.media.id, m.id));
  expect(after).toMatchObject({ status: "unknown", sonarrId: null });
  expect((await db.select().from(schema.media).where(eq(schema.media.id, other.id)))[0]).toMatchObject({ status: "available", sonarrId: 8 });
});

it("finds what a request went to, or leaves it to the caller when it's gone", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      const body = url.endsWith("tvdbId=501") ? [{ id: 8, tvdbId: 501 }] : url.endsWith("tvdbId=999") ? [] : url.includes("/history/") ? [{ downloadId: HASH }] : url.endsWith("/series/8") ? { id: 8, tvdbId: 501 } : "";
      if (url.endsWith("/auth/login")) return new Response("Fails.");
      return new Response(body === "" ? "" : JSON.stringify(body), { status: 200 });
    }),
  );
  expect(await deleteRequested("sonarr", 999, false)).toBeNull();
  // It went through; qBittorrent turning the password down is only a note.
  expect(await deleteRequested("sonarr", 501, false)).toEqual({ note: "qBittorrent didn't accept the username and password, so its torrent is still there." });
  // Files kept: Sonarr leaves them, and Jellyshelf still counts it as in the library.
  expect(calls).toContain("DELETE http://sonarr:8989/api/v3/series/8?deleteFiles=false&addImportListExclusion=false");
  expect(await db.select().from(schema.requests)).toEqual([]);
  expect((await db.select().from(schema.media).where(eq(schema.media.tvdbId, 501)))[0]).toMatchObject({ status: "available", sonarrId: null });
  // Radarr isn't set up here: nothing to delete there, the caller just removes the request.
  expect(await deleteRequested("radarr", 1, true)).toBeNull();
});
