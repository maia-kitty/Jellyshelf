import { cookies } from "next/headers";
import { DEBUG_COOKIE, parseDebug, type DebugOptions } from "./debugShared";

export async function debugOptions(): Promise<DebugOptions> {
  return parseDebug((await cookies()).get(DEBUG_COOKIE)?.value);
}

/** Simulated slow loading (Settings → Debug). No-op unless this browser turned it on. */
export async function debugSleep(kind: "page" | "episodes") {
  const o = await debugOptions();
  const ms = kind === "page" ? o.pageDelay : o.episodesDelay;
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}
