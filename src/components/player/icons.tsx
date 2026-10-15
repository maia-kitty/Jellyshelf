const PATHS: Record<string, React.ReactNode> = {
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  pause: (
    <g fill="currentColor" stroke="none">
      <rect x="6.5" y="5" width="4" height="14" rx="1" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" />
    </g>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  rewind: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
      <text x="12" y="15.5" fontSize="7" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="700">10</text>
    </>
  ),
  forward: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
      <text x="12" y="15.5" fontSize="7" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="700">10</text>
    </>
  ),
  next: (
    <>
      <path d="M6 5.5v13l9-6.5z" fill="currentColor" stroke="none" />
      <path d="M18 5v14" strokeWidth="2.4" />
    </>
  ),
  volume: <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />,
  muted: <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9.5l5 5M21 9.5l-5 5" />,
  subs: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M7 13.5h4M13 13.5h4M7 10.5h6" />
    </>
  ),
  audio: <path d="M5 10v4M9 7v10M13 4.5v15M17 8v8M21 10.5v3" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  pip: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  fullscreen: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  unfullscreen: <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />,
};

export function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
