"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { boxOf, jelly, place } from "./jelly";

export type SelectOption<T> = { value: T; label: string; /** Heading it sits under (consecutive options share one). */ group?: string };

type Pos = { left?: number; right?: number; top?: number; bottom?: number; minWidth: number; maxWidth: number; up: boolean };

/**
 * A dropdown in the app's own look: the list drops open with a wobble and a jelly highlight follows the pointer and the
 * arrow keys. Focus stays on the button, as with a native select, so the keyboard and screen readers work as there.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const blob = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [hi, setHi] = useState(0);
  const lastHi = useRef<number | null>(null);
  const open = pos !== null;
  const sel = Math.max(0, options.findIndex((o) => o.value === value));

  // The list is fixed to the window (so no scrolling box clips it), under the button or above it if there's no room,
  // and grows away from the nearer screen edge so it isn't squeezed.
  const measure = () => {
    const r = btn.current!.getBoundingClientRect();
    const tall = Math.min(288, options.length * 36 + 16);
    const up = r.bottom + tall + 8 > innerHeight && r.top > innerHeight - r.bottom;
    const fromRight = r.left + r.width / 2 > innerWidth / 2;
    setPos({
      minWidth: r.width,
      up,
      ...(fromRight ? { right: innerWidth - r.right, maxWidth: r.right - 8 } : { left: r.left, maxWidth: innerWidth - r.left - 8 }),
      ...(up ? { bottom: innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  };
  const show = () => {
    if (disabled) return;
    setHi(sel);
    measure();
  };
  const choose = (i: number) => {
    setPos(null);
    if (options[i].value !== value) onChange(options[i].value);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.contains(t)) setPos(null);
    };
    // Escape closes the list wherever focus is (Safari doesn't focus a clicked button), and not a dialog it sits in.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPos(null);
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc, true);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The highlight: dropped straight onto the chosen option on open, then jelly from option to option.
  useLayoutEffect(() => {
    const b = blob.current;
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`);
    if (!open || !b || !el) return void (lastHi.current = null);
    if (lastHi.current === null) place(b, boxOf(el));
    else if (lastHi.current !== hi) jelly(b, boxOf(b), boxOf(el), { duration: 550 });
    lastHi.current = hi;
    el.scrollIntoView({ block: "nearest" });
  }, [open, hi]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = options.length;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "Tab") return setPos(null);
    if (e.key === "ArrowDown") setHi((i) => Math.min(n - 1, i + 1));
    else if (e.key === "ArrowUp") setHi((i) => Math.max(0, i - 1));
    else if (e.key === "Home") setHi(0);
    else if (e.key === "End") setHi(n - 1);
    else if (e.key === "Enter" || e.key === " ") choose(hi);
    else if (e.key.length === 1) {
      // Type a letter to jump to the next option starting with it.
      const j = Array.from({ length: n }, (_, d) => (hi + 1 + d) % n).find((j) => options[j].label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (j !== undefined) setHi(j);
    } else return;
    e.preventDefault();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${hi}` : undefined}
        // Named buttons are read by their name alone, so put the current choice in it, as a native select would say it.
        aria-label={ariaLabel && `${ariaLabel}: ${options[sel]?.label ?? ""}`}
        onClick={() => (open ? setPos(null) : show())}
        onKeyDown={onKeyDown}
        className={clsx("input inline-flex items-center gap-2 text-left disabled:opacity-60", open && "border-accent", className)}
      >
        {/* Every label stacked in one cell, only the chosen one visible: the button is as wide as the longest, like a native select. */}
        <span className="grid min-w-0 flex-1">
          {options.map((o, i) => (
            <span key={i} aria-hidden={i !== sel} className={clsx("truncate [grid-area:1/1]", i !== sel && "invisible")}>
              {o.label}
            </span>
          ))}
        </span>
        <svg viewBox="0 0 24 24" aria-hidden className={clsx("h-4 w-4 shrink-0 text-muted transition-transform duration-300", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-label={ariaLabel}
            className="jelly-drop fixed z-[60] max-h-72 w-max overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel p-1 shadow-2xl shadow-black/50"
            style={{ left: pos.left, right: pos.right, top: pos.top, bottom: pos.bottom, minWidth: pos.minWidth, maxWidth: pos.maxWidth, transformOrigin: pos.up ? "bottom" : "top" }}
          >
            <div className="relative">
              <span ref={blob} aria-hidden className="pointer-events-none absolute rounded-lg bg-accent/15 ring-1 ring-inset ring-accent/60" />
              {options.map((o, i) => (
                <Fragment key={i}>
                  {o.group && o.group !== options[i - 1]?.group && (
                    <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{o.group}</div>
                  )}
                  <div
                    id={`${id}-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={i === sel}
                    onPointerEnter={() => setHi(i)}
                    // Keep focus on the button.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(i)}
                    className={clsx("relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors", i === hi ? "text-fg" : "text-muted")}
                  >
                    <span className="flex-1">{o.label}</span>
                    <svg viewBox="0 0 24 24" aria-hidden className={clsx("h-4 w-4 shrink-0 text-accent", i !== sel && "invisible")} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
