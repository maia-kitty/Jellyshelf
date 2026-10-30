"use client";

import { useEffect, useRef, useState } from "react";

/** A plain <video> for a /watch/anime stream: hls.js wherever the browser can't play HLS itself (all but Safari). */
export function StreamPlayer({ src, subtitles }: { src: string; subtitles: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = video.current!;
    // Same test as the main player's: Chrome and Firefox claim HLS on Android but play it badly.
    if (v.canPlayType("application/vnd.apple.mpegurl") && !/Chrome\/|Firefox\//.test(navigator.userAgent)) {
      v.src = src;
      return;
    }
    let hls: { destroy(): void } | undefined;
    let gone = false;
    import("hls.js").then(({ default: Hls }) => {
      if (gone) return;
      const h = new Hls({ maxBufferLength: 30 });
      h.on(Hls.Events.ERROR, (_e, d) => d.fatal && setFailed(true));
      h.loadSource(src);
      h.attachMedia(v);
      hls = h;
    });
    return () => {
      gone = true;
      hls?.destroy();
    };
  }, [src]);

  return (
    <div className="relative">
      <video ref={video} controls autoPlay playsInline crossOrigin="anonymous" onError={() => setFailed(true)} className="aspect-video w-full rounded-xl bg-black">
        {subtitles && <track kind="subtitles" src={subtitles} srcLang="en" label="English" default />}
      </video>
      {failed && <p className="absolute inset-x-0 top-1/2 text-center text-sm text-white/80">This stream didn&apos;t load. Try again later, or the other audio.</p>}
    </div>
  );
}
