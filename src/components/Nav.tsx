"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppIcon } from "./AppIcon";

type NavUser = { displayName: string; avatar: string | null; role: string; hasAnilist: boolean };

const ICON: Record<string, React.ReactNode> = {
  discover: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z" />,
  library: <path d="M5 4v16M9 4v16M13 6.5l3.6-1.9 4.4 13.9-3.6 1.9zM3 20h18" />,
  anime: <path d="M4 7h16v10H4zM9 4l3 3 3-3M10 10.5v3l2.5-1.5z" />,
  movies: <path d="M4 5h16v14H4zM4 9h16M4 15h16M8 5v4M16 5v4M8 15v4M16 15v4" />,
  series: <path d="M3 6h18v11H3zM8 20h8M12 17v3" />,
  requests: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
};

const LINKS = [
  { href: "/", label: "Discover", icon: "discover" },
  { href: "/library", label: "Library", icon: "library" },
  { href: "/discover/anime", label: "Anime", icon: "anime" },
  { href: "/discover/movies", label: "Movies", icon: "movies" },
  { href: "/discover/tv", label: "Series", icon: "series" },
  { href: "/my-lists", label: "My AniList", anilist: true },
  { href: "/ratings", label: "Ratings" },
  { href: "/requests", label: "Requests", icon: "requests" },
];

const LINE = "left-0 h-0.5 rounded-full bg-[linear-gradient(90deg,#aa5cc3,#00a4dc)]";
/** The jelly line under a header link spans its text, not its padding (px-3). */
const underText = (p: Pill | null) => p && { ...p, x: p.x + 12, w: p.w - 24 };

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

type Pill = { x: number; y: number; w: number; h: number; animate: boolean };

/**
 * A highlight that slides to whichever link in `box` has data-active. It jumps into place the first time (nothing to
 * slide from) and glides on every navigation after; it follows the layout as the bar resizes.
 */
function useSlidingPill<T extends HTMLElement>(path: string) {
  const box = useRef<T>(null);
  const [pill, setPill] = useState<Pill | null>(null);
  useLayoutEffect(() => {
    const measure = (animate: boolean) => {
      const el = box.current?.querySelector<HTMLElement>("[data-active='true']");
      setPill((prev) => (el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, animate: animate && prev !== null } : null));
    };
    measure(true);
    // A ResizeObserver reports once as soon as it starts observing; acting on that would snap the pill into place
    // mid-glide. Only real resizes after that should jump it.
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) first = false;
      else measure(false);
    });
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [path]);
  return { box, pill };
}

/** `fitY` sizes it to the link's height too, for bars taller than their links. */
function PillBg({ pill, className, fitY }: { pill: Pill | null; className: string; fitY?: boolean }) {
  if (!pill) return null;
  return (
    <span
      aria-hidden
      className={clsx("nav-pill pointer-events-none absolute", className)}
      style={{
        width: pill.w,
        ...(fitY && { top: pill.y, height: pill.h }),
        transform: `translateX(${pill.x}px)`,
        transition: pill.animate ? "transform 0.4s cubic-bezier(0.3, 1.25, 0.5, 1), width 0.4s cubic-bezier(0.3, 1.25, 0.5, 1)" : "none",
      }}
    />
  );
}

export function Nav({ user }: { user: NavUser }) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const links = LINKS.filter((l) => !l.anilist || user.hasAnilist);
  const desk = useSlidingPill<HTMLElement>(path);
  const tab = useSlidingPill<HTMLElement>(path);
  const dock = useSlidingPill<HTMLElement>(path);

  // "/" jumps to search from anywhere that isn't already a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The player is the whole screen: no bar (or search field) left underneath it.
  if (path.startsWith("/watch/")) return null;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
          <Link href="/" className="jar-trigger flex shrink-0 items-center gap-2 text-lg font-bold">
            <AppIcon size={28} animate="hover" /> <span className="hidden sm:inline">Jellyshelf</span>
          </Link>
          {/* Stretched to the header's full height so the jelly line can ride its bottom edge, like the dock's top. */}
          <nav ref={desk.box} className="relative -my-3 hidden items-center gap-1 self-stretch lg:flex">
            <PillBg pill={desk.pill} fitY className="left-0 rounded-lg bg-panel-2" />
            <PillBg pill={underText(desk.pill)} className={clsx("-bottom-px", LINE)} />
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                data-active={isActive(path, l.href)}
                className={clsx(
                  "relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors duration-300",
                  isActive(path, l.href) ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <form
            role="search"
            className="relative ml-auto min-w-0 flex-1 lg:max-w-xs"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
              search.current?.blur();
            }}
          >
            {/* Not a login field, whatever password managers guess: keep their autofill menus off it. */}
            <input
              ref={search}
              type="search"
              name="q"
              autoComplete="off"
              data-bwignore="true"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              enterKeyHint="search"
              className="input pr-8 [&::-webkit-search-cancel-button]:hidden"
              placeholder="Search anime, movies, series…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[11px] text-muted sm:block">
              /
            </kbd>
          </form>
          <UserMenu user={user} links={links} path={path} />
        </div>
        {/* Tablet: the links get their own scrolling row. It reaches 1px down over the header's border, so the line
            can sit on it without overflowing (the row clips, being a scroller). */}
        <nav ref={tab.box} className="relative mx-auto -mb-px hidden [scrollbar-width:none] max-w-[1600px] gap-1 overflow-x-auto px-4 pb-[9px] sm:flex sm:px-6 lg:hidden">
          <PillBg pill={tab.pill} className="bottom-[9px] left-0 top-0 rounded-lg bg-panel-2" />
          <PillBg pill={underText(tab.pill)} className={clsx("bottom-0", LINE)} />
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              data-active={isActive(path, l.href)}
              className={clsx(
                "relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors duration-300",
                isActive(path, l.href) ? "text-fg" : "text-muted",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Phone: a bottom tab bar for the main sections; the rest lives in the avatar menu. */}
      <nav ref={dock.box} className="fixed inset-x-0 bottom-0 z-30 flex transform-gpu border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {/* A soft glow behind the current tab, and a jelly line along the top edge, both gliding between tabs. */}
        <PillBg pill={dock.pill} className="left-0 top-1 h-[calc(100%-env(safe-area-inset-bottom)-0.5rem)] rounded-2xl bg-accent/12" />
        <PillBg pill={dock.pill && { ...dock.pill, x: dock.pill.x + dock.pill.w / 4, w: dock.pill.w / 2 }} className={clsx("-top-px", LINE)} />
        {LINKS.filter((l) => l.icon).map((l) => {
          const on = isActive(path, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              data-active={on}
              className={clsx(
                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-[color,transform] duration-300 active:scale-90",
                on ? "text-accent" : "text-muted",
              )}
            >
              {/* Re-keyed when it becomes the current tab, so the hop plays each time you switch to it. */}
              <svg
                key={on ? "on" : "off"}
                viewBox="0 0 24 24"
                className={clsx("h-5 w-5", on && "tab-pop")}
                fill="none"
                stroke="currentColor"
                strokeWidth={on ? 2.1 : 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {ICON[l.icon!]}
              </svg>
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function UserMenu({ user, links, path }: { user: NavUser; links: typeof LINKS; path: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item = "block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-panel-2";
  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open} className="block rounded-full ring-accent focus-visible:ring-2">
        {user.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-sm">{user.displayName[0]}</div>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-2xl">
          <div className="px-3 pb-2 pt-1.5">
            <div className="truncate text-sm font-semibold">{user.displayName}</div>
            <div className="text-xs text-muted">{user.role === "admin" ? "Admin" : "Member"}</div>
          </div>
          <div className="my-1 border-t border-line" />
          {/* On phones these aren't in the tab bar. */}
          {links
            .filter((l) => !l.icon)
            .map((l) => (
              <Link key={l.href} href={l.href} className={clsx(item, "sm:hidden")}>
                {l.label}
              </Link>
            ))}
          {!user.hasAnilist && (
            // A plain link: the OAuth round-trip is a full navigation.
            <a href="/api/auth/anilist" className={clsx(item, "text-anilist")}>
              Link AniList
            </a>
          )}
          {user.role === "admin" && (
            <Link href="/settings" className={item}>
              Settings
            </Link>
          )}
          <button
            className={clsx(item, "text-muted")}
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
