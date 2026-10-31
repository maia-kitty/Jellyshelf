"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sits after a chapter's last page. Once it scrolls into view the chapter counts as read: AniList progress goes up
 * (see /api/manga/read). Once per chapter per visit.
 */
export function ChapterDone({ anilistId, chapter, linked }: { anilistId: number; chapter: number; linked: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => {
    if (!linked || !el.current) return;
    const seen = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      seen.disconnect();
      fetch("/api/manga/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anilistId, chapter }) })
        .then((r) => r.json())
        .then((r) => r.anilist && setSaved(r.anilist.progress))
        .catch(() => {});
    });
    seen.observe(el.current);
    return () => seen.disconnect();
  }, [anilistId, chapter, linked]);
  return (
    <div ref={el} className="py-3 text-center text-sm text-muted" aria-live="polite">
      {saved !== null ? `AniList: chapter ${saved} read` : linked ? "End of chapter" : "End of chapter · link AniList in your profile to track what you've read"}
    </div>
  );
}
