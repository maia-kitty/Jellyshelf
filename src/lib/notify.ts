import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Media } from "@/db/schema";
import { joinUrl } from "./clients/http";
import { appSecret } from "./secret";
import { getSettings } from "./settings";

/**
 * Phone notifications through ntfy. Each person has their own topic, unguessable since it's all that stands between
 * them and anyone reading it; Jellyshelf relays it (read-only) on its own address, so ntfy itself can stay private.
 * shortcut: topics are derived from the user id, so one can't be revoked; store a random one per user if that's needed.
 */
export const topicFor = (userId: number) => `js_${crypto.createHmac("sha256", appSecret()).update(`ntfy:${userId}`).digest("hex").slice(0, 24)}`;

/** Whether every one of these topics belongs to someone here. */
export async function knownTopics(topics: string[]) {
  const mine = new Set((await db.select({ id: schema.users.id }).from(schema.users)).map((u) => topicFor(u.id)));
  return topics.length > 0 && topics.every((t) => mine.has(t));
}

export const mediaPath = (m: Media) => (m.kind === "anime" ? `/anime/${m.anilistId}` : `/${m.kind}/${m.tmdbId}`);

type Note = { title: string; message: string; path?: string; tags?: string[] };

/** Send to these people. Never throws: a notification going missing mustn't fail what triggered it. */
export async function notify(userIds: number[], note: Note) {
  try {
    const { ntfy, general } = await getSettings();
    if (!ntfy.url || !userIds.length) return;
    // Tapping it opens the page, unless Jellyshelf only knows itself as localhost (useless from a phone).
    const click = note.path && !/\/\/(localhost|127\.)/.test(general.appUrl) ? joinUrl(general.appUrl, note.path) : undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (ntfy.token) headers.Authorization = `Bearer ${ntfy.token}`;
    await Promise.all(
      [...new Set(userIds)].map(async (id) => {
        const res = await fetch(ntfy.url, {
          method: "POST",
          headers,
          body: JSON.stringify({ topic: topicFor(id), title: note.title, message: note.message, tags: note.tags, click }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`ntfy: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      }),
    );
  } catch (e) {
    console.warn("[notify]", e instanceof Error ? e.message : e);
  }
}

export async function notifyAdmins(note: Note, except?: number) {
  const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "admin"));
  return notify(admins.map((a) => a.id).filter((id) => id !== except), note);
}

/** Requests that just finished downloading: tell whoever asked for them. */
export async function notifyCompleted(requestIds: number[]) {
  if (!requestIds.length) return;
  const rows = await db
    .select({ userId: schema.requests.userId, media: schema.media })
    .from(schema.requests)
    .innerJoin(schema.media, eq(schema.media.id, schema.requests.mediaId))
    .where(inArray(schema.requests.id, requestIds));
  // One per title per person, though an anime's seasons can finish together as separate requests.
  const seen = new Set<string>();
  for (const { userId, media } of rows) {
    if (seen.has(`${userId}:${media.id}`)) continue;
    seen.add(`${userId}:${media.id}`);
    await notify([userId], { title: "Ready to watch", message: media.title, path: mediaPath(media), tags: ["tada"] });
  }
}
