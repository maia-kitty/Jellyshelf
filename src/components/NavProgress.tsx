"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

/*
 * Page loading, shown one way everywhere: a little jar tipped over at the left end of the header, its jelly running
 * along the header's bottom edge as the progress bar. It runs from a link click until the new page is in, and for as
 * long as anything says it's loading (route loading screens, the library's filter/sort) via <PageLoading />.
 */

// What's loading besides a click: a count of mounted <PageLoading /> / active usePageLoading(true).
let loaders = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
const change = (d: number) => {
  loaders += d;
  listeners.forEach((fn) => fn());
};

/** Keeps the header jar running while `active`. */
export function usePageLoading(active = true) {
  useEffect(() => {
    if (!active) return;
    change(1);
    return () => change(-1);
  }, [active]);
}

/** Drop into a loading screen: the header jar runs while it's on screen. */
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  usePageLoading();
  return <span role="status" className="sr-only">{label}</span>;
}

export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [clicked, setClicked] = useState(false);
  const others = useSyncExternalStore(subscribe, () => loaders, () => 0);
  const busy = clicked || others > 0;
  const [phase, setPhase] = useState<"off" | "on" | "finishing">("off");

  // Arrived (a loading screen, if any, keeps it going).
  useEffect(() => setClicked(false), [path, search]);
  // A link whose click was cancelled never navigates; don't leave the jar spilling forever.
  useEffect(() => {
    if (!clicked) return;
    const t = setTimeout(() => setClicked(false), 45_000);
    return () => clearTimeout(t);
  }, [clicked]);

  useEffect(() => {
    if (busy) {
      if (phase === "finishing") setPhase("on");
      if (phase !== "off") return;
      // Fast pages shouldn't flash it: only once loading has taken a moment.
      const t = setTimeout(() => setPhase("on"), 150);
      return () => clearTimeout(t);
    }
    if (phase === "on") setPhase("finishing");
    if (phase === "finishing") {
      const t = setTimeout(() => setPhase("off"), 450);
      return () => clearTimeout(t);
    }
  }, [busy, phase]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a");
      if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin || to.pathname.startsWith("/api/")) return;
      if (to.pathname === location.pathname && to.search === location.search) return; // same page (or just a #hash)
      setClicked(true);
    };
    // Capture phase: Next's <Link> cancels the browser's own navigation, which would hide the click from a bubble listener.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (phase === "off") return null;
  return (
    <div aria-hidden className={`edge-spill pointer-events-none absolute inset-x-0 bottom-0 ${phase === "finishing" ? "edge-spill-done" : ""}`}>
      {/* the jar, lying on the header's edge with its mouth to the right (same drawing as the loading jar) */}
      <svg viewBox="12 20 52 38" className="absolute bottom-0 left-2 h-4 w-auto" overflow="visible">
        <defs>
          <linearGradient id="edge-jar" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#aa5cc3" />
            <stop offset="1" stopColor="#00a4dc" />
          </linearGradient>
        </defs>
        <path d="M41 58 C42 54.5 45 50.5 50 49.5 L57 49.5 C60 49.5 62.5 52.5 62.5 58 Z" fill="#aa5cc3" />
        <rect x="14" y="22" width="38" height="34" rx="9" fill="url(#edge-jar)" />
        <rect x="49" y="27" width="6" height="24" rx="2" fill="url(#edge-jar)" />
        <rect x="31" y="27" width="15" height="4" rx="2" fill="#fff" opacity=".35" />
        <path d="M27.5 34 L38.5 34 L33 44.5 Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {/* the jelly: runs from the jar's mouth along the edge */}
      <div className="absolute -bottom-px left-7 right-0 h-[3px]">
        <div className="edge-spill-bar h-full origin-left rounded-full" style={{ backgroundImage: "linear-gradient(90deg, #aa5cc3, #00a4dc)" }} />
      </div>
    </div>
  );
}
