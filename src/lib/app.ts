"use client";

import { useSyncExternalStore } from "react";
import type { AppDownload } from "./appDownloads";

export { mangaDownload, videoDownload, type AppDownload } from "./appDownloads";

/**
 * The Android app's bridge (`window.JellyshelfApp`), there only when Jellyshelf runs inside the app: it downloads
 * chapters and videos for offline use and has its own Downloads screen. Everything here is a no-op in a browser.
 */
interface Bridge {
  download(json: string): void;
  status(): string;
  openDownloads(): void;
}

export type DownloadState = { state: "queued" | "downloading" | "done" | "failed"; progress: number };

const bridge = () => (typeof window === "undefined" ? undefined : (window as unknown as { JellyshelfApp?: Bridge }).JellyshelfApp);
export const inApp = () => !!bridge();
const never = () => () => {};
/** In the app? For rendering: false on the server and during hydration, so the page doesn't mismatch. */
export const useInApp = () => useSyncExternalStore(never, inApp, () => false);

export function download(items: AppDownload | AppDownload[]) {
  const b = bridge();
  if (b) for (const it of Array.isArray(items) ? items : [items]) b.download(JSON.stringify(it));
  poke();
}
export const openDownloads = () => bridge()?.openDownloads();

// One poll for the whole page, however many buttons are on it: every second while the app is downloading, every five
// otherwise (downloads can also be started or deleted from the app's own screen).
let states: Record<string, DownloadState> = {};
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
function poll() {
  const b = bridge();
  if (!b) return;
  try {
    states = JSON.parse(b.status());
  } catch {}
  listeners.forEach((l) => l());
  const busy = Object.values(states).some((s) => s.state === "queued" || s.state === "downloading");
  timer = setTimeout(poll, busy ? 1000 : 5000);
}
function poke() {
  clearTimeout(timer);
  poll();
}
function subscribe(l: () => void) {
  listeners.add(l);
  if (listeners.size === 1) poll();
  return () => {
    listeners.delete(l);
    if (!listeners.size) clearTimeout(timer);
  };
}
/** This item's download, live; null outside the app. */
export function useDownload(key: string): DownloadState | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (inApp() ? (states[key] ?? null) : undefined),
    () => undefined,
  );
}
