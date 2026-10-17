"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import { usePageLoading } from "./NavProgress";
import { Tabs } from "./PillTabs";
import { Select } from "./Select";

/** Sort and filter for a library grid; dims the grid and runs the header's jelly jar while the next page loads, like every other page load. */
export function LibraryControls({
  base,
  sort,
  filter,
  sorts,
  filters,
  children,
}: {
  base: string;
  sort: string;
  filter: string;
  sorts: { key: string; label: string }[];
  filters: { key: string; label: string }[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  usePageLoading(pending);
  const go = (s: string, f: string) => start(() => router.push(`${base}?sort=${s}&filter=${f}`));
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs className="flex flex-wrap gap-2" tabs={filters} active={filter} onSelect={(f) => go(sort, f)} />
        <div className="ml-auto flex items-center gap-2 text-sm text-muted">
          Sort
          <Select aria-label="Sort" className="w-auto py-1.5" value={sort} onChange={(s) => go(s, filter)} options={sorts.map((s) => ({ value: s.key, label: s.label }))} />
        </div>
      </div>
      <div className={clsx("transition-opacity duration-200", pending && "pointer-events-none opacity-40")}>{children}</div>
    </>
  );
}
