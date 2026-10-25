"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Grows and shrinks smoothly to fit what's inside, instead of jumping: e.g. the episode list turning up once a
 * request reaches Sonarr, or replacing its loader. The first size is taken as is; only changes after that animate.
 */
export function AutoHeight({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = inner.current!;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      className="overflow-hidden transition-[height] duration-500 ease-[cubic-bezier(0.2,0.8,0.3,1)] motion-reduce:transition-none"
      style={{ height: height ?? "auto" }}
    >
      {/* flow-root: the content's bottom margin counts towards the height instead of leaking past it */}
      <div ref={inner} className="flow-root">
        {children}
      </div>
    </div>
  );
}
