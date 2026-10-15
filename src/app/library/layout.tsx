import { LibraryNav } from "@/components/LibraryNav";
import { soft } from "@/lib/cards";
import { libraryViews } from "@/lib/library";
import { pageUser } from "@/lib/page";
import { canPlay } from "@/lib/playback";

/** Shared by every Library page, so the library switcher stays while you move between them. */
export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  const views = canPlay(user) ? await soft(libraryViews(user), [], "library views") : null;
  return (
    <>
      {views && <LibraryNav views={views} />}
      {children}
    </>
  );
}
