"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

/** An image that fades in once it has actually loaded (cached or not), instead of popping in late. */
/**
 * `fast`: for posters in rows, which already animate (hover zoom) with their own `transition` class; that transition
 * then carries the fade too, instead of the slow one used for big backdrops.
 */
export function FadeImg({ className, fast = false, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fast?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  // Already in cache: it may have finished before hydration, so onLoad won't fire.
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth) setLoaded(true);
  }, []);
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      ref={ref}
      {...props}
      onLoad={() => setLoaded(true)}
      className={clsx("fade-img", !fast && "transition-opacity duration-700 ease-out", !loaded && "!opacity-0", className)}
    />
  );
}
