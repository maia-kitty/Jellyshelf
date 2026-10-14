"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Discover" },
  { href: "/discover/anime", label: "Anime" },
  { href: "/discover/movies", label: "Movies" },
  { href: "/discover/tv", label: "Series" },
  { href: "/my-lists", label: "My AniList", anilist: true },
  { href: "/ratings", label: "Ratings" },
  { href: "/requests", label: "Requests" },
];

export function Nav({ user }: { user: { displayName: string; avatar: string | null; role: string; hasAnilist: boolean } }) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const links = [...LINKS.filter((l) => !l.anilist || user.hasAnilist), ...(user.role === "admin" ? [{ href: "/settings", label: "Settings" }] : [])];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="text-accent">狐</span> Kitsune
        </Link>
        <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={clsx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition", active ? "bg-panel-2 text-fg" : "text-muted hover:text-fg")}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <form
          className="ml-auto flex-1 sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <input className="input" placeholder="Search anime, movies, series…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div className="flex items-center gap-2">
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-sm">{user.displayName[0]}</div>
          )}
          <button
            className="text-xs text-muted hover:text-fg"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
