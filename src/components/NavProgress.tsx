"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A thin jelly bar along the top of the screen from the moment a link is clicked until the new page is in, so a click
 * always visibly registers, even when the page behind it is slow (AniList's rate limit can make one wait).
 */
export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  // Arrived: finish the bar and fade it out.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
  }, [path, search]);
  useEffect(() => {
    if (state === "done") {
      const t = setTimeout(() => setState("idle"), 400);
      return () => clearTimeout(t);
    }
    if (state === "loading") {
      // A link whose click was cancelled never navigates; don't leave the bar up forever.
      const t = setTimeout(() => setState("idle"), 45_000);
      return () => clearTimeout(t);
    }
  }, [state]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a");
      if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin || to.pathname.startsWith("/api/")) return;
      if (to.pathname === location.pathname && to.search === location.search) return; // same page (or just a #hash)
      setState("loading");
    };
    // Capture phase: Next's <Link> cancels the browser's own navigation, which would hide the click from a bubble listener.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (state === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">
      <div
        className={state === "loading" ? "nav-progress h-full" : "nav-progress-done h-full"}
        style={{ backgroundImage: "linear-gradient(90deg, #aa5cc3, #00a4dc)" }}
      />
    </div>
  );
}
