"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { boxOf, jelly, JELLY_MS, place, same, type Box } from "./jelly";

/**
 * Each row's latest move, and when that copy of the row was last on screen. When a page swap remounts the row, the new
 * copy carries on the same move mid-flight (or, coming back some other way, slides over from where it was left).
 */
const moves = new Map<string, { from: Box; to: Box; start: number; seen: number }>();

/**
 * A row of pill links whose highlight is a blob of jelly: on a switch it stretches out to reach the new tab (thinning
 * as it goes), then its tail snaps after it and it wobbles to rest. It moves on the click, before the page arrives.
 */
export function Tabs({
  tabs,
  active,
  className = "mb-6 flex flex-wrap gap-2",
  onSelect,
  small,
  children,
}: {
  /** Links to pages; without an href, a button that calls onSelect. */
  tabs: { key: string; label: string; href?: string }[];
  active: string;
  className?: string;
  onSelect?: (key: string) => void;
  small?: boolean;
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
  const group = tabs.map((t) => `${t.href?.split("?")[0] ?? ""}#${t.key}`).join();

  useLayoutEffect(() => {
    const b = blob.current;
    const el = row.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(shown)}"]`);
    if (!b) return;
    if (!el) {
      // None of these is the current page (a library item, say): no blob until one is.
      b.style.width = "";
      return setReady(false);
    }
    const to = boxOf(el);
    const now = performance.now();
    const last = moves.get(group);
    const placed = !!b.style.width;
    let from: Box | null = null;
    let at = 0;
    if (placed) from = boxOf(b); // wherever it is, mid-move or at rest
    else if (last && now - last.start < JELLY_MS && same(last.to, to)) [from, at] = [last.from, now - last.start];
    else if (last && now - last.seen < 4000) from = last.to;
    setReady(true);
    if (from && !same(from, to)) {
      if (!at) moves.set(group, { from, to, start: now, seen: now });
    } else if (!at) moves.set(group, { from: to, to, start: -Infinity, seen: now });
    jelly(b, from ?? to, to, { at });
    const r = row.current!;
    // A row that scrolls sideways (phones) brings the current tab fully into view, so the jelly never lands off-screen;
    // only as far as needed, so the heading at the start stays put whenever it can.
    const pad = 16;
    const left = to.x - pad < r.scrollLeft ? to.x - pad : to.x + to.w + pad > r.scrollLeft + r.clientWidth ? to.x + to.w + pad - r.clientWidth : null;
    if (left !== null) r.scrollTo({ left, behavior: placed ? "smooth" : "instant" });
    // Fonts arriving or the row wrapping differently move the tab; follow it (a running move keeps its own path).
    const ro = new ResizeObserver(() => place(b, boxOf(el)));
    ro.observe(row.current!);
    return () => {
      ro.disconnect();
      const m = moves.get(group);
      if (m) m.seen = performance.now();
    };
  }, [shown, group]);

  return (
    <nav ref={row} className={clsx("relative isolate", className)}>
      {children}
      <span ref={blob} aria-hidden className={clsx(
          "pointer-events-none absolute rounded-full border border-accent bg-[color-mix(in_srgb,var(--color-accent)_15%,var(--color-bg))]",
          !ready && "hidden",
        )} />
      {tabs.map((t) => {
        // Each pill's outline sits beneath the (solid) jelly, so the jelly hides the outlines it slides over.
        const cls = clsx(
          "relative shrink-0 rounded-full border border-transparent transition active:scale-95",
          small ? "px-3 py-0.5 text-xs" : "px-3.5 py-1.5 text-sm",
          "before:absolute before:-inset-px before:-z-10 before:rounded-full before:border before:content-['']",
          // Only the others fade their outline: the current one's is under the jelly, and fading it would show as a
          // flicker when a page swap redraws the row before the jelly has got there.
          t.key !== shown
            ? "text-muted before:border-line before:transition hover:text-fg hover:before:border-muted"
            : ready
              ? "text-fg before:border-transparent"
              : "text-fg before:border-accent before:bg-accent/15",
        );
        return t.href ? (
          <Link
            key={t.key}
            href={t.href}
            data-tab={t.key}
            aria-current={t.key === active ? "page" : undefined}
            onClick={(e) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) && setClicked(t.key)}
            className={cls}
          >
            {t.label}
          </Link>
        ) : (
          <button key={t.key} type="button" data-tab={t.key} aria-pressed={t.key === active} onClick={() => (setClicked(t.key), onSelect?.(t.key))} className={cls}>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
