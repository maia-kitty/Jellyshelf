import { useState } from "react";
import clsx from "clsx";

// Split into parts so each icon can move its own way (keyframes in globals.css, under .pi-go): the play triangle
// pops, the pause bars drop in, the rewind arrow turns back, the sound waves ripple out, the audio bars bounce…
const at = (i: number) => ({ "--i": i }) as React.CSSProperties;
const corner = (d: string, dx: number, dy: number) => <path key={d} className="pi-corner" style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as React.CSSProperties} d={d} />;
const SPEAKER = "M4 9.5h3.5L12 5.5v13L7.5 14.5H4z";

// Play and pause are one drawing: each half of the triangle and one pause bar have matching corners, so the shapes
// morph into each other (a CSS transition on `d`; Safari can't, and just swaps them).
const MORPH = {
  play: ["M8 5.5L13.5 8.75L13.5 15.25L8 18.5Z", "M13.5 8.75L19 12L19 12L13.5 15.25Z"],
  pause: ["M7 5.5L10 5.5L10 18.5L7 18.5Z", "M14 5.5L17 5.5L17 18.5L14 18.5Z"],
};
const playPause = (name: "play" | "pause") => (
  <g fill="currentColor" strokeWidth="1.5">
    {MORPH[name].map((d, i) => (
      <path key={i} className="pi-morph" d={d} style={{ d: `path("${d}")` } as React.CSSProperties} />
    ))}
  </g>
);

const PATHS: Record<string, React.ReactNode> = {
  play: playPause("play"),
  pause: playPause("pause"),
  back: <path className="pi-nudge-l" d="M15 5l-7 7 7 7" />,
  rewind: (
    <>
      <path className="pi-turn-l" d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
      <text x="12" y="15.5" fontSize="7" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="700">10</text>
    </>
  ),
  forward: (
    <>
      <path className="pi-turn-r" d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
      <text x="12" y="15.5" fontSize="7" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="700">10</text>
    </>
  ),
  next: (
    <>
      <path className="pi-nudge-r" d="M6 5.5v13l9-6.5z" fill="currentColor" stroke="none" />
      <path className="pi-bump" d="M18 5v14" strokeWidth="2.4" />
    </>
  ),
  volume: (
    <>
      <path d={SPEAKER} />
      <path className="pi-wave" style={at(0)} d="M15.5 9a4 4 0 0 1 0 6" />
      <path className="pi-wave" style={at(1)} d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  muted: (
    <>
      <path d={SPEAKER} />
      <path className="pi-draw" style={at(0)} pathLength={1} d="M16 9.5l5 5" />
      <path className="pi-draw" style={at(1)} pathLength={1} d="M21 9.5l-5 5" />
    </>
  ),
  subs: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path className="pi-draw" style={at(0)} pathLength={1} d="M7 10.5h6" />
      <path className="pi-draw" style={at(1)} pathLength={1} d="M7 13.5h4" />
      <path className="pi-draw" style={at(2)} pathLength={1} d="M13 13.5h4" />
    </>
  ),
  audio: ["M5 10v4", "M9 7v10", "M13 4.5v15", "M17 8v8", "M21 10.5v3"].map((d, i) => <path key={d} className="pi-eq" style={at(i)} d={d} />),
  gear: (
    <g className="pi-spin">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </g>
  ),
  pip: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect className="pi-slide" x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  // Corners push out to go fullscreen, and pull in to leave it.
  fullscreen: [corner("M4 9V4h5", -1.5, -1.5), corner("M15 4h5v5", 1.5, -1.5), corner("M20 15v5h-5", 1.5, 1.5), corner("M9 20H4v-5", -1.5, 1.5)],
  unfullscreen: [corner("M9 4v5H4", 1.5, 1.5), corner("M20 9h-5V4", -1.5, 1.5), corner("M15 20v-5h5", -1.5, -1.5), corner("M4 15h5v5", 1.5, -1.5)],
};

/** A player icon. When it changes (play → pause, muted…) the new one makes its move; buttons replay it on hover and press. */
export function Icon({ name }: { name: string }) {
  const [prev, setPrev] = useState(name);
  const [changed, setChanged] = useState(false);
  if (name !== prev) {
    setPrev(name);
    setChanged(true);
  }
  return (
    <svg
      key={name === "pause" ? "play" : name}
      viewBox="0 0 24 24"
      overflow="visible"
      className={clsx("player-icon h-6 w-6", changed && "pi-go")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
