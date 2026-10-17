import { cookies } from "next/headers";
import { fuzzyToday } from "./listEntry";

/** Set by the browser (see TimeZoneCookie), so dates written to AniList and ratings are the viewer's own. */
export const TZ_COOKIE = "jellyshelf_tz";

/** Today in the signed-in viewer's time zone. Only inside a request. */
export async function viewerToday() {
  return fuzzyToday(new Date(), (await cookies()).get(TZ_COOKIE)?.value);
}
