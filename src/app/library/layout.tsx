import { LibraryNav } from "@/components/LibraryNav";
import { soft } from "@/lib/cards";
import { libraryViews } from "@/lib/library";
import { pageUser } from "@/lib/page";
import { canPlay } from "@/lib/playback";
import { getSettings } from "@/lib/settings";

/** Shared by every Library page, so the library switcher stays while you move between them. */
export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  const views = canPlay(user) ? await soft(libraryViews(user), [], "library views") : null;
  const manga = !!(await getSettings()).mangarr.url;
  return (
    <>
      {(views || manga) && <LibraryNav views={views ?? []} manga={manga} />}
      {children}
    </>
  );
}
