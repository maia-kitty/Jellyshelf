import type { Metadata } from "next";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Jellyshelf",
  description: "Request movies, series and anime",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {user && (
          <Nav user={{ displayName: user.displayName, avatar: user.avatar, role: user.role, hasAnilist: !!user.anilistId }} />
        )}
        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
