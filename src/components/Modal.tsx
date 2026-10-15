"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

/** A dialog over the page: centred on desktop, a bottom sheet on phones. Escape or a click outside closes it. */
export function Modal({
  title,
  kicker,
  onClose,
  children,
  toolbar,
  className,
}: {
  title: React.ReactNode;
  /** Small label above the title. */
  kicker?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** A row under the header that doesn't scroll (filters and such). */
  toolbar?: React.ReactNode;
  className?: string;
}) {
  // Callers pass a fresh arrow each render; keep the listener stable anyway.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={clsx("flex max-h-[85vh] w-full max-w-3xl flex-col rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl", className)}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0 flex-1">
            {kicker && <div className="text-xs uppercase tracking-wide text-muted">{kicker}</div>}
            <div className="truncate font-semibold">{title}</div>
          </div>
          <button className="rounded-lg px-2 py-1 text-xl leading-none text-muted hover:bg-panel-2 hover:text-fg" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {toolbar && <div className="border-b border-line px-5 py-2">{toolbar}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{children}</div>
      </div>
    </div>
  );
}
