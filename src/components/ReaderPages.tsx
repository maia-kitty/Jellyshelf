"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

type Mode = "single" | "double";
const KEY = "reader:mode";
/** Wide enough for two pages side by side: a landscape window at least this wide. */
const wideEnough = () => innerWidth >= 1100 && innerWidth > innerHeight;

/**
 * A chapter's pages. Single: one long strip. Double (wide landscape screens): two pages side by side like an open book,
 * right to left for Japanese manga. The first page (the cover) and double-page spreads (wide images) take the whole
 * row; the pairs after them line up on their own. Long-strip webtoons always use the strip. The choice is remembered.
 */
export function ReaderPages({ id, chapter, count, rtl, strip }: { id: number; chapter: number; count: number; rtl: boolean; strip: boolean }) {
  // null until the browser says what fits, so the first paint isn't a strip that then jumps into pairs.
  const [mode, setMode] = useState<Mode | null>(null);
  const [wide, setWide] = useState<Set<number>>(new Set());
  useEffect(() => {
    const saved = localStorage.getItem(KEY) as Mode | null;
    setMode(strip ? "single" : (saved ?? (wideEnough() ? "double" : "single")));
  }, [strip]);
  const pick = (m: Mode) => {
    setMode(m);
    localStorage.setItem(KEY, m);
  };
  const src = (i: number) => `/api/manga/${id}/${chapter}/${i}`;
  // A page wider than tall is a double-page spread; one much taller than wide is a webtoon strip. Both stand alone.
  const measure = (i: number) => (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if ((w > h || h > w * 2.2) && !wide.has(i)) setWide((s) => new Set(s).add(i));
  };

  const double = mode === "double";
  return (
    <>
      {!strip && mode && (
        <div className="mx-auto mb-2 flex max-w-3xl justify-end gap-1 text-xs" role="group" aria-label="Page layout">
          {(["single", "double"] as const).map((m) => (
            <button
              key={m}
              onClick={() => pick(m)}
              aria-pressed={mode === m}
              className={clsx("rounded-md border px-2 py-1", mode === m ? "border-accent text-fg" : "border-line text-muted hover:text-fg")}
            >
              {m === "single" ? "1 page" : "2 pages"}
            </button>
          ))}
        </div>
      )}
      <div
        dir={double && rtl ? "rtl" : "ltr"}
        className={clsx("my-4", double ? "mx-auto grid grid-cols-2 items-center" : "-mx-4 flex flex-col items-center sm:mx-auto sm:max-w-3xl")}
        // Two portrait pages are about 1.4 times as wide as they are tall: this keeps a spread within the window.
        style={double ? { maxWidth: "min(100%, 140vh)" } : undefined}
      >
        {Array.from({ length: count }, (_, i) => {
          const alone = double && (i === 0 || wide.has(i));
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src(i)}
              alt={`Page ${i + 1}`}
              loading={i < 4 ? "eager" : "lazy"}
              decoding="async"
              onLoad={measure(i)}
              className={clsx(
                "block h-auto bg-panel-2",
                !double && "w-full",
                double && !alone && "w-full",
                // The cover alone: one page wide, centred. A spread: the full row.
                alone && (wide.has(i) ? "col-span-2 w-full" : "col-span-2 mx-auto w-1/2"),
              )}
              style={{ minHeight: mode ? (double ? "30vh" : "40vh") : "40vh" }}
            />
          );
        })}
      </div>
    </>
  );
}
