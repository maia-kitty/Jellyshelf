import { sized } from "@/lib/img";

/**
 * A title's art blurred faint behind a card: its colour, not a second picture. The card needs `relative
 * overflow-hidden` and its content `relative`, so it sits above this.
 */
export function ArtGlow({ src }: { src: string | null | undefined }) {
  if (!src) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...sized(src, 48)} alt="" aria-hidden decoding="async" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-panel/40 via-panel/70 to-panel" />
    </>
  );
}
