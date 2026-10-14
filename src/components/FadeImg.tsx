"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

/** An image that fades in once it has actually loaded (cached or not), instead of popping in late. */
export function FadeImg({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
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
      className={clsx("fade-img transition-opacity duration-700 ease-out", !loaded && "!opacity-0", className)}
    />
  );
}
