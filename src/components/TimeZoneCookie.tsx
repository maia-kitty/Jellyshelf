"use client";

import { useEffect } from "react";

/** Tells the server this browser's time zone (must match TZ_COOKIE in lib/today.ts). */
export function TimeZoneCookie() {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) document.cookie = `jellyshelf_tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return null;
}
