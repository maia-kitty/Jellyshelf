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
          <circle cx="22" cy="16" r="3.5" fill="#c9a0ff" style={{ "--dx": "-16px", "--dy": "-24px" } as React.CSSProperties} />
          <circle cx="32" cy="14" r="4" fill="#ffffff" style={{ "--dx": "0px", "--dy": "-32px" } as React.CSSProperties} />
          <circle cx="42" cy="16" r="3.5" fill="#8fe3ff" style={{ "--dx": "16px", "--dy": "-24px" } as React.CSSProperties} />
        </g>
      )}
    </svg>
  );
}

/** Centered loading state: the jar with its lid bobbing, plus an optional caption. */
export function JarLoader({ label, size = 40, className }: { label?: string; size?: number; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-3 text-sm text-muted", className)} role="status">
      <AppIcon size={size} animate="loading" />
      {label && <span>{label}</span>}
    </div>
  );
}
