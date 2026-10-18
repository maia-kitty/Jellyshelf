import { NextResponse } from "next/server";
import { joinUrl } from "@/lib/clients/http";
import { knownTopics } from "@/lib/notify";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ topics: string; rest: string[] }> };

/**
 * The ntfy app's way in: it's pointed at Jellyshelf's own address as its server, and next.config rewrites
 * /<topic>/json (and the rest) here. Only Jellyshelf's topics, and only reading them (the long-lived JSON or SSE
 * stream, polling, and the app's access check); publishing stays between Jellyshelf and ntfy.
 */
const ALLOWED = new Set(["json", "sse", "raw", "auth"]);

export async function GET(req: Request, { params }: Ctx) {
  const { topics, rest } = await params;
  if (rest.length !== 1 || !ALLOWED.has(rest[0]) || !(await knownTopics(topics.split(",")))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { ntfy } = await getSettings();
  if (!ntfy.url) return NextResponse.json({ error: "Notifications aren't set up" }, { status: 404 });
  const upstream = await fetch(joinUrl(ntfy.url, `/${topics}/${rest[0]}`) + new URL(req.url).search, {
    headers: ntfy.token ? { Authorization: `Bearer ${ntfy.token}` } : {},
    // The app hanging up ends the stream to ntfy too.
    signal: req.signal,
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ error: "Couldn't reach ntfy" }, { status: 502 });
  return new Response(upstream.body, {
    status: upstream.status,
    // no-transform: compressing would hold each notification back until a buffer fills.
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
