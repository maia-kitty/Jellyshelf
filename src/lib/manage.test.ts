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
type Request = typeof schema.requests.$inferSelect;

const HASH = "ab".repeat(20);
/** A sent-on request as the Requests page removes it: the whole series unless it says otherwise. */
const req = (p: Partial<Request>) => ({ id: 0, status: "completed", seasons: null, episodeRanges: null, absolute: false, ...p }) as Request;

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
      // As qBittorrent 5 answers: no body, and the session cookie named after the port.
      if (url.endsWith("/auth/login")) return new Response(null, { status: 204, headers: { "Set-Cookie": "QBT_SID_8080=s1; HttpOnly; path=/" } });
      if (url.includes("/torrents/") && new Headers(init?.headers).get("Cookie") !== "QBT_SID_8080=s1") return new Response("Forbidden", { status: 403 });
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
  expect(await deleteRequested(req({ target: "sonarr", targetId: 999 }), false)).toBeNull();
  // It went through; qBittorrent turning the password down is only a note.
  expect(await deleteRequested(req({ target: "sonarr", targetId: 501 }), false)).toEqual({ note: "qBittorrent didn't accept the username and password, so its torrent is still there." });
  // Files kept: Sonarr leaves them, and Jellyshelf still counts it as in the library.
  expect(calls).toContain("DELETE http://sonarr:8989/api/v3/series/8?deleteFiles=false&addImportListExclusion=false");
  expect(await db.select().from(schema.requests)).toEqual([]);
  expect((await db.select().from(schema.media).where(eq(schema.media.tvdbId, 501)))[0]).toMatchObject({ status: "available", sonarrId: null });
  // Radarr isn't set up here: nothing to delete there, the caller just removes the request.
  expect(await deleteRequested(req({ target: "radarr", targetId: 1 }), true)).toBeNull();
});

it("removes only a season request's part of a series, leaving the other seasons, their requests and shared torrents", async () => {
  const [user] = await db.insert(schema.users).values({ displayName: "b", role: "admin" }).returning();
  const [m] = await db.insert(schema.media).values({ kind: "tv", title: "Seasons", tmdbId: 3, tvdbId: 600, sonarrId: 9, status: "available" }).returning();
  const [s1, s2] = await db
    .insert(schema.requests)
    .values([
      { mediaId: m.id, userId: user.id, status: "completed", target: "sonarr", targetId: 600, seasons: [1] },
      { mediaId: m.id, userId: user.id, status: "completed", target: "sonarr", targetId: 600, seasons: [2] },
    ])
    .returning();
  const PACK = "cd".repeat(20); // S1 and S2 in one torrent: S1 still needs it
  const S2_ONLY = "ef".repeat(20);
  const ep = (id: number, seasonNumber: number, episodeFileId: number) => ({ id, seriesId: 9, seasonNumber, episodeNumber: id % 10, monitored: true, hasFile: episodeFileId > 0, episodeFileId });
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}${init?.body && !url.endsWith("/auth/login") ? ` ${init.body}` : ""}`);
      if (url.endsWith("/auth/login")) return new Response(null, { status: 204, headers: { "Set-Cookie": "QBT_SID_8080=s1" } });
      if (url.endsWith("tvdbId=600")) return Response.json([{ id: 9, tvdbId: 600 }]);
      // S2E1 and S2E2 share one file (a double episode); S2E3 hasn't downloaded.
      if (url.includes("/episode?seriesId=9")) return Response.json([ep(11, 1, 101), ep(12, 1, 102), ep(21, 2, 201), ep(22, 2, 201), ep(23, 2, 0)]);
      if (url.endsWith("/series/9") && !init?.method) return Response.json({ id: 9, tvdbId: 600, seasons: [{ seasonNumber: 1, monitored: true }, { seasonNumber: 2, monitored: true }] });
      if (url.includes("/history/series")) return Response.json([{ downloadId: PACK, episodeId: 11 }, { downloadId: PACK, episodeId: 21 }, { downloadId: S2_ONLY, episodeId: 21 }, { downloadId: S2_ONLY, episodeId: 22 }]);
      return new Response("", { status: 200 });
    }),
  );

  expect(await deleteRequested(s2, true)).toEqual({ note: null });

  expect(calls).not.toContainEqual(expect.stringMatching(/DELETE \S+\/series\//));
  expect(calls).toContain(`PUT http://sonarr:8989/api/v3/series/9 ${JSON.stringify({ id: 9, tvdbId: 600, seasons: [{ seasonNumber: 1, monitored: true }, { seasonNumber: 2, monitored: false }] })}`);
  expect(calls).toContain(`PUT http://sonarr:8989/api/v3/episode/monitor ${JSON.stringify({ episodeIds: [21, 22, 23], monitored: false })}`);
  expect(calls).toContain(`DELETE http://sonarr:8989/api/v3/episodefile/bulk ${JSON.stringify({ episodeFileIds: [201] })}`);
  expect(calls).toContain(`POST http://qbit:8080/api/v2/torrents/delete hashes=${S2_ONLY}&deleteFiles=true`);
  // S1's request stays, and the series stays linked.
  expect((await db.select().from(schema.requests).where(eq(schema.requests.targetId, 600))).map((r) => r.id)).toEqual([s1.id]);
  expect((await db.select().from(schema.media).where(eq(schema.media.id, m.id)))[0]).toMatchObject({ sonarrId: 9 });
});

it("takes the whole series when a season request was all that was left of it", async () => {
  const [user] = await db.insert(schema.users).values({ displayName: "c", role: "admin" }).returning();
  const [m] = await db.insert(schema.media).values({ kind: "tv", title: "Last", tmdbId: 4, tvdbId: 700, sonarrId: 10, status: "available" }).returning();
  const [only] = await db.insert(schema.requests).values({ mediaId: m.id, userId: user.id, status: "completed", target: "sonarr", targetId: 700, seasons: [1] }).returning();
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("tvdbId=700")) return Response.json([{ id: 10, tvdbId: 700 }]);
      // S2 is neither wanted nor downloaded.
      if (url.includes("/episode?seriesId=10")) return Response.json([{ id: 31, seasonNumber: 1, monitored: true, hasFile: true, episodeFileId: 301 }, { id: 41, seasonNumber: 2, monitored: false, hasFile: false, episodeFileId: 0 }]);
      if (url.endsWith("/series/10")) return Response.json({ id: 10, tvdbId: 700 });
      if (url.includes("/history/")) return Response.json([]);
      if (url.endsWith("/auth/login")) return new Response(null, { status: 204, headers: { "Set-Cookie": "QBT_SID_8080=s1" } });
      return new Response("", { status: 200 });
    }),
  );

  expect(await deleteRequested(only, false)).toEqual({ note: null });
  expect(calls).toContain("DELETE http://sonarr:8989/api/v3/series/10?deleteFiles=false&addImportListExclusion=false");
  expect(await db.select().from(schema.requests).where(eq(schema.requests.targetId, 700))).toEqual([]);
});
