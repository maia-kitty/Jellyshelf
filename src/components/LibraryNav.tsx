"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

/** The library switcher: stays put on every Library page, so you can always hop between libraries or back Home. */
export function LibraryNav({ views }: { views: { id: string; name: string }[] }) {
  const path = usePathname();
  const tabs = [{ href: "/library", label: "Home" }, ...views.map((v) => ({ href: `/library/${v.id}`, label: v.name }))];
  const active = (href: string) => (href === "/library" ? path === "/library" : path.startsWith(href));
  return (
    <nav className="scroll-row -mx-1 mb-6 flex items-center gap-2 overflow-x-auto px-1 pb-1">
      <h1 className="mr-2 shrink-0 text-2xl font-bold">Library</h1>
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active(t.href) ? "page" : undefined}
          className={clsx(
            "shrink-0 rounded-full border px-4 py-1.5 text-sm transition active:scale-95",
            active(t.href) ? "border-accent bg-accent/15 text-fg" : "border-line text-muted hover:border-muted hover:text-fg",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
