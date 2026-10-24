"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppIcon } from "./AppIcon";
import { NavProgress } from "./NavProgress";
import { DRAG_KEY, dragOn } from "./DragScroll";
import { PhoneNotifications } from "./PhoneNotifications";
import { unreachable } from "@/lib/unreachable";
import { initial } from "@/lib/initial";
import { Switch } from "./Switch";

type NavUser = { displayName: string; avatar: string | null; role: string; hasAnilist: boolean; canLinkAnilist: boolean; canUnlinkAnilist: boolean; ntfy: { topic: string; server: string | null } | null };

// Split into parts so each icon can move its own way (keyframes in globals.css): the compass needle spins, the
// leaning book tips up and drops back, the tiles pop in turn, the rows slide in, the bookmark's tick draws itself.
const tile = (i: number, d: string) => <path key={i} className="ni-tile" style={{ "--i": i } as React.CSSProperties} d={d} />;
const ICON: Record<string, React.ReactNode> = {
  discover: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path className="ni-needle" d="M15.5 8.5l-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  library: (
    <>
      <path d="M5 4v16M9 4v16M3 20h18" />
      <path className="ni-book" d="M13 6.5l3.6-1.9 4.4 13.9-3.6 1.9z" />
    </>
  ),
  browse: [tile(0, "M4 4h7v7H4z"), tile(1, "M13 4h7v7h-7z"), tile(2, "M4 13h7v7H4z"), tile(3, "M13 13h7v7h-7z")],
  // The app's own mark: a jar with a play button, whose lid pops open.
  requests: (
    <>
      <rect x="5" y="8.5" width="14" height="12.5" rx="3.5" />
      <rect className="ni-lid" x="7" y="3.5" width="10" height="2.5" rx="1" />
      <path className="ni-play" d="M10.5 12v5.5l4.5-2.75z" />
    </>
  ),
  lists: (
    <>
      <path className="ni-mark" d="M6 3.5h12v17l-6-4-6 4z" />
      <path className="ni-check" pathLength={1} d="M9 9.5l2 2 4-4" />
    </>
  ),
};

const LINKS = [
  { href: "/", label: "Discover", icon: "discover" },
  { href: "/library", label: "Library", icon: "library" },
  // Anime, movies and series, switched on the page.
  { href: "/discover/anime", label: "Browse", icon: "browse", match: ["/discover/"] },
  // Your lists and your ratings.
  { href: "/my-lists", label: "My AniList", icon: "lists", match: ["/my-lists", "/ratings"] },
  { href: "/requests", label: "Requests", icon: "requests" },
];

/** A link's icon; re-keyed when it becomes the current one (or is hovered as it), so the hop and its move play again. */
function NavIcon({ icon, on, className }: { icon: string; on: boolean; className: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [replay, setReplay] = useState(0);
  // Hovering the current tab plays its move again. CSS :hover can't (its animation is already the one hover would set,
  // so nothing restarts); drawing the icon afresh does. Other tabs get theirs from :hover in globals.css.
  useEffect(() => {
    const link = svg.current?.closest(".nav-link");
    if (!on || !link || !matchMedia("(hover: hover)").matches) return;
    const again = () => setReplay((n) => n + 1);
    link.addEventListener("mouseenter", again);
    return () => link.removeEventListener("mouseenter", again);
  }, [on]);
  return (
    <svg
      ref={svg}
      key={on ? `on${replay}` : "off"}
      aria-hidden
      viewBox="0 0 24 24"
      overflow="visible"
      className={clsx("nav-icon shrink-0", className, on && "tab-pop")}
      fill="none"
      stroke="currentColor"
      strokeWidth={on ? 2.1 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON[icon]}
    </svg>
  );
}

const LINE = "left-0 h-0.5 rounded-full bg-[linear-gradient(90deg,#aa5cc3,#00a4dc)]";
/** The jelly line under a header link spans its text, not its padding (px-3). */
const underText = (p: Pill | null) => p && { ...p, x: p.x + 12, w: p.w - 24 };

const isActive = (path: string, l: { href: string; match?: string[] }) =>
  l.href === "/" ? path === "/" : (l.match ?? [l.href]).some((m) => path.startsWith(m));

type Pill = { x: number; y: number; w: number; h: number; animate: boolean };

/**
 * A highlight that slides to whichever link in `box` has data-active. It jumps into place the first time (nothing to
 * slide from) and glides on every navigation after; it follows the layout as the bar resizes.
 */
function useSlidingPill<T extends HTMLElement>(path: string) {
  const box = useRef<T>(null);
  const [pill, setPill] = useState<Pill | null>(null);
  useLayoutEffect(() => {
    let last = "";
    const measure = (animate: boolean) => {
      const el = box.current?.querySelector<HTMLElement>("[data-active='true']");
      const at = el ? `${el.offsetLeft},${el.offsetTop},${el.offsetWidth},${el.offsetHeight}` : "";
      // A ResizeObserver reports once as soon as it starts observing; snapping on that would cut a glide short. So
      // only move when the link really is somewhere else now (fonts loading late shift every link, for one).
      if (!animate && at === last) return;
      last = at;
      setPill((prev) => (el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, animate: animate && prev !== null } : null));
    };
    measure(true);
    const ro = new ResizeObserver(() => measure(false));
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
            <PillBg pill={desk.pill} fitY className="left-0 rounded-lg bg-accent/12" />
            <PillBg pill={underText(desk.pill)} className={clsx("-bottom-px", LINE)} />
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                data-active={isActive(path, l)}
                className={clsx(
                  "nav-link relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors duration-300",
                  isActive(path, l) ? "text-accent" : "text-muted hover:text-fg",
                )}
              >
                <NavIcon icon={l.icon} on={isActive(path, l)} className="hidden h-4 w-4 xl:block" />
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
          <UserMenu user={user} path={path} />
        </div>
        {/* Tablet: the links get their own scrolling row. It reaches 1px down over the header's border, so the line
            can sit on it without overflowing (the row clips, being a scroller). */}
        <nav ref={tab.box} className="relative mx-auto -mb-px hidden [scrollbar-width:none] max-w-[1600px] gap-1 overflow-x-auto px-4 pb-[9px] sm:flex sm:px-6 lg:hidden">
          <PillBg pill={tab.pill} className="bottom-[9px] left-0 top-0 rounded-lg bg-accent/12" />
          <PillBg pill={underText(tab.pill)} className={clsx("bottom-0", LINE)} />
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              data-active={isActive(path, l)}
              className={clsx(
                "nav-link relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors duration-300",
                isActive(path, l) ? "text-accent" : "text-muted",
              )}
            >
              <NavIcon icon={l.icon} on={isActive(path, l)} className="h-4 w-4" />
              {l.label}
            </Link>
          ))}
        </nav>
        <Suspense fallback={null}>
          <NavProgress className="absolute inset-x-0 bottom-0 max-sm:hidden" />
        </Suspense>
      </header>

      {/* Phone: the same five as a bottom tab bar. */}
      <nav ref={dock.box} className="fixed inset-x-0 bottom-0 z-30 flex transform-gpu border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {/* A soft glow behind the current tab, and a jelly line along the top edge, both gliding between tabs. */}
        <PillBg pill={dock.pill} className="left-0 top-1 h-[calc(100%-env(safe-area-inset-bottom)-0.5rem)] rounded-2xl bg-accent/12" />
        <PillBg pill={dock.pill && { ...dock.pill, x: dock.pill.x + dock.pill.w / 4, w: dock.pill.w / 2 }} className={clsx("-top-px", LINE)} />
        {/* page loading: the jar sits on the dock's top edge here, where the thumb (and eye) is */}
        <Suspense fallback={null}>
          <NavProgress className="absolute inset-x-0 top-0" />
        </Suspense>
        {LINKS.map((l) => {
          const on = isActive(path, l);
          return (
            <Link
              key={l.href}
              href={l.href}
              data-active={on}
              className={clsx(
                "nav-link relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-[color,transform] duration-300 active:scale-90",
                on ? "text-accent" : "text-muted",
              )}
            >
              <NavIcon icon={l.icon} on={on} className="h-5 w-5" />
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function UserMenu({ user, path }: { user: NavUser; path: string }) {
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

  const [drag, setDrag] = useState(true);
  useEffect(() => {
    if (open) setDrag(dragOn());
  }, [open]);
  const [notifs, setNotifs] = useState(false);
  // Layout only; each item adds its own display and colours, so no two classes fight over one property.
  const row = "w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm";
  const item = clsx("flex", row, "text-fg/85 hover:bg-panel-2 hover:text-fg");
  const avatar = (size: string, text: string) =>
    user.avatar ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={user.avatar} alt="" className={clsx(size, "rounded-full object-cover")} />
    ) : (
      <div className={clsx(size, text, "flex items-center justify-center rounded-full bg-panel-2")}>{initial(user.displayName)}</div>
    );
  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open} className="block rounded-full ring-accent focus-visible:ring-2">
        {avatar("h-8 w-8", "text-sm")}
      </button>
      {open && (
        <div className="menu menu-in absolute right-0 top-full z-40 mt-2 w-64 origin-top-right">
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            {avatar("h-10 w-10", "text-base")}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user.displayName}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                {user.role === "admin" ? "Admin" : "Member"}
                {user.hasAnilist && <span className="rounded bg-anilist/15 px-1.5 py-px text-[10px] text-anilist">AniList</span>}
              </div>
            </div>
          </div>
          <div className="mx-1 mb-1 border-t border-line" />
          {/* Only once the server is set up for AniList; until then the link would just fail. */}
          {!user.hasAnilist && user.canLinkAnilist && (
            // A plain link: the OAuth round-trip is a full navigation.
            <a href="/api/auth/anilist" className={clsx("flex", row, "text-anilist hover:bg-anilist/10")}>
              <MenuIcon d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
              Link AniList
            </a>
          )}
          {/* Only once an admin has set up ntfy. */}
          {user.ntfy && (
            <button
              className={item}
              onClick={() => {
                setOpen(false);
                setNotifs(true);
              }}
            >
              <MenuIcon d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
              Phone notifications
            </button>
          )}
          {/* Only where there's a mouse to drag with. */}
          <button
            role="menuitemcheckbox"
            aria-checked={drag}
            className={clsx(row, "hidden text-fg/85 hover:bg-panel-2 hover:text-fg pointer-fine:flex")}
            onClick={() => {
              try {
                localStorage.setItem(DRAG_KEY, drag ? "0" : "1");
              } catch {}
              setDrag(!drag);
            }}
          >
            <MenuIcon d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.6-2.2L4.5 15a1.6 1.6 0 0 1 2.4-2.1L9 15" />
            <span className="flex-1">Drag to scroll</span>
            <Switch on={drag} />
          </button>
          {user.role === "admin" && (
            <Link href="/settings" className={item}>
              <MenuIcon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              Settings
            </Link>
          )}
          <div className="mx-1 my-1 border-t border-line" />
          {/* Not for an account that signs in with AniList alone: it would have no way back in. */}
          {user.hasAnilist && user.canUnlinkAnilist && (
            <button
              className={clsx("flex", row, "text-muted hover:bg-panel-2 hover:text-fg")}
              onClick={async () => {
                if (!confirm("Disconnect AniList? Your lists stop showing here and episodes stop syncing. Your ratings stay, and you can connect again any time.")) return;
                const res = await fetch("/api/auth/anilist", { method: "DELETE" }).catch(unreachable);
                if (!res.ok) return alert((await res.json().catch(() => ({}))).error ?? "Couldn't disconnect AniList.");
                setOpen(false);
                router.refresh();
              }}
            >
              <MenuIcon d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-1.2-6.5M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 1.2 6.5M4 4l16 16" />
              Disconnect AniList
            </button>
          )}
          <button
            className={clsx("flex", row, "text-fg/85 hover:bg-bad/10 hover:text-bad")}
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
              router.refresh();
            }}
          >
            <MenuIcon d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
            Sign out
          </button>
        </div>
      )}
      {notifs && user.ntfy && <PhoneNotifications topic={user.ntfy.topic} server={user.ntfy.server} admin={user.role === "admin"} onClose={() => setNotifs(false)} />}
    </div>
  );
}

/** A 16px line icon for the account menu. */
function MenuIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 opacity-80" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
