"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "./PillTabs";

/** The library switcher: stays put on every Library page, so you can always hop between libraries or back Home. */
export function LibraryNav({ views }: { views: { id: string; name: string }[] }) {
  const path = usePathname();
  const tabs = [{ key: "/library", href: "/library", label: "Home" }, ...views.map((v) => ({ key: `/library/${v.id}`, href: `/library/${v.id}`, label: v.name }))];
  const active = tabs.findLast((t) => (t.href === "/library" ? path === "/library" : path.startsWith(t.href)))?.key ?? "";
  return (
    <Tabs tabs={tabs} active={active} className="scroll-row -mx-1 -mt-1.5 mb-6 flex items-center gap-2 overflow-x-auto px-1 pb-1 pt-1.5">
      <h1 className="mr-2 shrink-0 text-2xl font-bold">Library</h1>
    </Tabs>
  );
}
