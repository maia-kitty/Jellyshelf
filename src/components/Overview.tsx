"use client";

import clsx from "clsx";
import { useRef, useState } from "react";

/** 4 lines at leading-relaxed (1.625). */
const COLLAPSED = "6.5em";

/** Long synopses fold to a few lines and slide open, rather than jumping, when expanded. */
export function Overview({ text }: { text: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // While animating, max-height is a measured pixel value; once fully open it's lifted so resizes can't clip.
  const [height, setHeight] = useState<string>(COLLAPSED);
  const long = text.length > 420;

  const toggle = () => {
    const el = body.current;
    if (!el) return;
    if (open) {
      // From "none" there's nothing to animate from: pin the current height first, then collapse next frame.
      setHeight(`${el.scrollHeight}px`);
      requestAnimationFrame(() => requestAnimationFrame(() => setHeight(COLLAPSED)));
    } else {
      setHeight(`${el.scrollHeight}px`);
    }
    setOpen(!open);
  };

  return (
    <div className="mt-4 max-w-3xl text-sm leading-relaxed text-fg/85">
      <div
        ref={body}
        className={clsx("overview-body overflow-hidden transition-[max-height] duration-500 ease-in-out", long && !open && "fade-bottom")}
        style={long ? { maxHeight: height } : undefined}
        onTransitionEnd={() => open && setHeight("none")}
      >
        <p className="whitespace-pre-line">{text}</p>
      </div>
      {long && (
        <button className="mt-1 text-xs font-medium text-accent hover:underline" onClick={toggle}>
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
