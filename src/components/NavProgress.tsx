"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { JarChip } from "./AppIcon";

/**
 * The jelly jar just under the header from a link click until the new page is in, so a click always visibly
 * registers, even when the page behind it is slow. Sits where the loading screens put it (header + main's padding).
 * Rendered inside the header, so it stays put under it however far the page is scrolled.
 */
export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "waiting" | "loading">("idle");

  // Arrived.
  useEffect(() => setState("idle"), [path, search]);
  useEffect(() => {
    // Fast pages shouldn't flash a jar: show it only once the click has taken a moment.
    if (state === "waiting") {
      const t = setTimeout(() => setState("loading"), 150);
      return () => clearTimeout(t);
    }
    // A link whose click was cancelled never navigates; don't leave the jar up forever.
    if (state === "loading") {
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
      setState("waiting");
    };
    // Capture phase: Next's <Link> cancels the browser's own navigation, which would hide the click from a bubble listener.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (state !== "loading") return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-full flex justify-center pt-6">
      <JarChip />
    </div>
  );
}
