"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";

type Box = { x: number; y: number; w: number; h: number };

/** Where each row's jelly last sat, so when a page swap remounts the row it slides on from there instead of popping. */
const lastAt = new Map<string, Box & { t: number }>();

const boxOf = (el: HTMLElement): Box => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
const css = (b: Box) => ({ left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });

/**
 * A row of pill links whose highlight is a blob of jelly: on a switch it stretches out to reach the new tab (thinning
 * as it goes), then its tail snaps after it and it wobbles to rest. It moves on the click, before the page arrives.
 */
export function Tabs({
  tabs,
  active,
  className = "mb-6 flex flex-wrap gap-2",
  children,
}: {
  tabs: { key: string; label: string; href: string }[];
  active: string;
  className?: string;
  /** Rendered before the tabs (a heading). */
  children?: React.ReactNode;
}) {
  const row = useRef<HTMLElement>(null);
  const blob = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const [clicked, setClicked] = useState<string | null>(null);
  const [prev, setPrev] = useState(active);
  if (prev !== active) {
    setPrev(active);
    setClicked(null);
  }
  const shown = clicked ?? active;
  const group = tabs.map((t) => `${t.href.split("?")[0]}#${t.key}`).join();

  useLayoutEffect(() => {
    const b = blob.current;
    const el = row.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(shown)}"]`);
    if (!b) return;
    if (!el) {
      // None of these is the current page (a library item, say): no blob, and it slides in from the last spot later.
      if (b.style.width) lastAt.set(group, { ...boxOf(b), t: Date.now() });
      b.style.width = "";
      return setReady(false);
    }
    const to = boxOf(el);
    const stored = lastAt.get(group);
    // Mid-move it's wherever the running animation has it; on mount, where the last copy of this row left it.
    const from = b.style.width ? boxOf(b) : stored && Date.now() - stored.t < 4000 ? stored : null;
    b.getAnimations().forEach((a) => a.cancel());
    Object.assign(b.style, css(to));
    setReady(true);
    const still = !from || (from.x === to.x && from.y === to.y && from.w === to.w);
    if (!still && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const x = Math.min(from.x, to.x);
      // Same line: reach across first. Wrapped onto another line: just glide there.
      const reach = Math.abs(from.y - to.y) < 4 ? { ...to, x, w: Math.max(from.x + from.w, to.x + to.w) - x } : to;
      b.animate(
        [
          { ...css(from), transform: "scale(1, 1)", easing: "cubic-bezier(0.5, 0, 0.9, 0.6)" },
          { ...css(reach), transform: "scale(1, 0.76)", offset: 0.28, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
          // The wobble is in scale, not position, so it's the same size however far the jelly travelled.
          { ...css(to), transform: "scale(1.05, 0.9)", offset: 0.55, easing: "ease-in-out" },
          { ...css(to), transform: "scale(0.97, 1.06)", offset: 0.75, easing: "ease-in-out" },
          { ...css(to), transform: "scale(1.01, 0.98)", offset: 0.9, easing: "ease-in-out" },
          { ...css(to), transform: "scale(1, 1)" },
        ],
        { duration: 750 },
      );
    }
    const r = row.current!;
    // A row that scrolls sideways (phones) centres the current tab, so the jelly never lands off-screen.
    if (r.scrollWidth > r.clientWidth) r.scrollTo({ left: to.x - (r.clientWidth - to.w) / 2, behavior: from ? "smooth" : "instant" });
    // Fonts arriving or the row wrapping differently move the tab; follow it (a running move keeps its own path).
    const ro = new ResizeObserver(() => Object.assign(b.style, css(boxOf(el))));
    ro.observe(row.current!);
    return () => {
      ro.disconnect();
      lastAt.set(group, { ...boxOf(b), t: Date.now() });
    };
  }, [shown, group]);

  return (
    <nav ref={row} className={clsx("relative isolate", className)}>
      {children}
      <span ref={blob} aria-hidden className={clsx(
          "pointer-events-none absolute rounded-full border border-accent bg-[color-mix(in_srgb,var(--color-accent)_15%,var(--color-bg))]",
          !ready && "hidden",
        )} />
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          data-tab={t.key}
          aria-current={t.key === active ? "page" : undefined}
          onClick={(e) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) && setClicked(t.key)}
          // Each pill's outline sits beneath the (solid) jelly, so the jelly hides the outlines it slides over.
          className={clsx(
            "relative shrink-0 rounded-full border border-transparent px-3.5 py-1.5 text-sm transition active:scale-95",
            "before:absolute before:-inset-px before:-z-10 before:rounded-full before:border before:transition before:content-['']",
            t.key !== shown
              ? "text-muted before:border-line hover:text-fg hover:before:border-muted"
              : ready
                ? "text-fg before:border-transparent"
                : "text-fg before:border-accent before:bg-accent/15",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
