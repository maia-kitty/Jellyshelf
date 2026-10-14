import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runAvailabilitySync } from "@/lib/jobs/availability";
import { webhookToken } from "@/lib/webhooks";

type Ctx = { params: Promise<{ service: string }> };

const g = globalThis as unknown as { __jellyshelfWebhookTimer?: ReturnType<typeof setTimeout> };

/**
 * Sonarr/Radarr "Connect → Webhook" and Jellyfin webhook plugin target.
 * Any event just schedules an availability sync (debounced, since imports arrive in bursts).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { service } = await params;
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const expected = webhookToken();
  if (token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return NextResponse.json({ error: "Bad token" }, { status: 401 });
  }
  const event = (await req.json().catch(() => ({}))) as { eventType?: string; NotificationType?: string };
  console.info(`[webhook:${service}] ${event.eventType ?? event.NotificationType ?? "event"}`);
  clearTimeout(g.__jellyshelfWebhookTimer);
  g.__jellyshelfWebhookTimer = setTimeout(() => void runAvailabilitySync().catch(console.error), 15_000);
  return NextResponse.json({ ok: true });
}
