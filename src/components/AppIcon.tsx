import clsx from "clsx";

/**
 * The Jellyshelf mark: a jar of jelly on a shelf. Keep the shapes in sync with app/icon.svg (the favicon).
 * The lid and play button are separate groups so they can be animated (keyframes in globals.css):
 * - "hover":   lid lifts and settles when the icon (or a parent with .jar-trigger) is hovered
 * - "intro":   the same, once, shortly after mount
 * - "loading": lid bobs open and shut, the play button peeks out
 * - "pop":     lid flies up and sparks burst out (request sent)
 */
export type JarAnimation = "hover" | "intro" | "loading" | "pop";

/** Where each spark flies from the lid (in icon units, so they carry well clear of a button-sized jar), its size, colour and delay. */
const SPARKS: [number, number, number, string, number][] = [
  [-62, -44, 6, "#c9a0ff", 0],
  [-30, -78, 4.5, "#ffffff", 0.05],
  [0, -96, 7, "#8fe3ff", 0.02],
  [34, -74, 4.5, "#ffffff", 0.07],
  [64, -40, 6, "#aa5cc3", 0.03],
  [-84, -8, 4, "#8fe3ff", 0.09],
  [86, -6, 4, "#c9a0ff", 0.1],
];

export function AppIcon({ size = 28, className, animate }: { size?: number; className?: string; animate?: JarAnimation }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      overflow="visible"
      className={clsx("jar", animate && `jar-${animate}`, className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="jellyshelf-jar" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#aa5cc3" />
          <stop offset="1" stopColor="#00a4dc" />
        </linearGradient>
      </defs>
      <rect x="14" y="18" width="36" height="34" rx="9" fill="url(#jellyshelf-jar)" />
      <rect x="19" y="24" width="4" height="15" rx="2" fill="#fff" opacity=".35" />
      <path className="jar-play" d="M28.5 28.5 L28.5 41.5 L40 35 Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <rect className="jar-lid" x="19" y="8" width="26" height="8" rx="2.5" fill="currentColor" />
      <rect x="5" y="55" width="54" height="4" rx="2" fill="currentColor" />
      {animate === "pop" && (
        // drawn last so the sparks fly in front of the lid
        <g className="jar-sparks">
          {SPARKS.map(([dx, dy, r, fill, d], i) => (
            <circle key={i} cx="32" cy="14" r={r} fill={fill} style={{ "--dx": `${dx}px`, "--dy": `${dy}px`, "--d": `${d}s` } as React.CSSProperties} />
          ))}
        </g>
      )}
    </svg>
  );
}

/**
 * Loading state: the jar lies on its side and the jelly pouring out of it is the progress bar.
 * There's no real progress to report (route/data loading), so the bar fills fast, then slows and
 * settles around 90%, like a browser's own loading bar; the loader unmounts when content arrives.
 * Bar and its rounded front are animated with transforms only (keyframes in globals.css).
 */
export function JarLoader({ label, width = 240, className }: { label?: string; width?: number; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-3 text-sm text-muted", className)} role="status" aria-label={label ?? "Loading"}>
      <svg width={width} height={(width * 64) / 200} viewBox="0 0 200 64" overflow="visible" className="spill text-fg" aria-hidden="true">
        <defs>
          <linearGradient id="spill-jar" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#aa5cc3" />
            <stop offset="1" stopColor="#00a4dc" />
          </linearGradient>
          {/* relative to the bar itself, so it stays purple at the jar and blue at the tip however far it has run */}
          <linearGradient id="spill-jelly" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#aa5cc3" />
            <stop offset="1" stopColor="#00a4dc" />
          </linearGradient>
        </defs>

        {/* shelf: same colour and thickness as in the icon */}
        <rect x="0" y="56" width="200" height="4" rx="2" fill="currentColor" />

        {/* lid, standing on its edge behind the jar */}
        <rect x="2" y="30" width="8" height="26" rx="2.5" fill="currentColor" />

        {/* the jelly bar: body scales out from the mouth, the round front edge travels with it. The front starts
            3 units behind the bar (hidden under the puddle) and its keyframes add those 3 back, so they meet. */}
        <rect className="spill-bar" x="58" y="48" width="138" height="8" fill="url(#spill-jelly)" />
        <g className="spill-head">
          <circle className="spill-head-wobble" cx="55" cy="52" r="4" fill="#00a4dc" />
        </g>

        {/* puddle under the mouth, drawn behind the jar so it runs back under the neck as well as forward; its top is
            level with the bar's so the jelly has no step where one meets the other */}
        <path className="spill-puddle" d="M41 56 C42 52.5 45 48 50 48 L57 48 C60 48 62.5 50.5 62.5 56 Z" fill="#aa5cc3" />

        {/* the jar, tipped over to the right and resting on the shelf. Everything on it is turned a quarter
            clockwise with it: the play arrow points down, the glass highlight runs along the top. */}
        <rect x="14" y="22" width="38" height="34" rx="9" fill="url(#spill-jar)" />
        <rect x="49" y="27" width="6" height="24" rx="2" fill="url(#spill-jar)" />
        <rect x="31" y="27" width="15" height="4" rx="2" fill="#fff" opacity=".35" />
        <path d="M27.5 34 L38.5 34 L33 44.5 Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />


      </svg>
      {label && <span>{label}</span>}
    </div>
  );
}
