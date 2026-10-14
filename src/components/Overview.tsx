"use client";

import clsx from "clsx";
import { useState } from "react";

/** Long synopses fold to a few lines with a toggle; short ones show as-is. */
export function Overview({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420;
  return (
    <div className="mt-4 max-w-3xl text-sm leading-relaxed text-fg/85">
      <p className={clsx("whitespace-pre-line", long && !open && "line-clamp-4")}>{text}</p>
      {long && (
        <button className="mt-1 text-xs font-medium text-accent hover:underline" onClick={() => setOpen((o) => !o)}>
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
