import type { Metadata } from "next";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Nav } from "@/components/Nav";
import { ScrollBounce } from "@/components/ScrollBounce";

// Every page depends on who's signed in and on runtime settings; never prerender at build time
// (which would also open the database during `next build`).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jellyshelf",
  description: "Request movies, series and anime",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([currentUser(), getSettings()]);
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {user && (
          <Nav user={{ displayName: user.displayName, avatar: user.avatar, role: user.role, hasAnilist: !!user.anilistId, canLinkAnilist: !!settings.anilist.clientId, canUnlinkAnilist: !!user.jellyfinUserId }} />
        )}
        {/* Full-bleed banners reach 100vw, which includes the scrollbar; clip that here rather than on <body>, whose
            overflow the browser applies to the whole viewport (and which knocks out fixed bars like the phone dock). */}
        {/* Phones: every page stays taller than the screen even with the browser's toolbar hidden. Firefox for Android
            loses bottom-fixed bars (the dock) when you arrive at a page too short to scroll while its toolbar is hidden;
            long pages never trigger it, so short ones (e.g. Requests) are given the same scroll room. */}
        <ScrollBounce />
        <div className="min-h-[calc(100lvh+6rem)] overflow-x-clip sm:min-h-0">
          <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-6 sm:px-6 sm:pb-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
