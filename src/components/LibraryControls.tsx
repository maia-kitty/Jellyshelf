"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";

/** Sort and filter for a library grid; dims the grid while the next page loads so a click always visibly does something. */
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
  const go = (s: string, f: string) => start(() => router.push(`${base}?sort=${s}&filter=${f}`));
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-line bg-panel p-0.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => go(sort, f.key)}
              className={clsx("rounded-full px-3.5 py-1 text-sm transition", f.key === filter ? "bg-panel-2 text-fg" : "text-muted hover:text-fg")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          Sort
          <select className="input w-auto py-1.5" value={sort} onChange={(e) => go(e.target.value, filter)}>
            {sorts.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={clsx("transition-opacity duration-200", pending && "pointer-events-none opacity-40")}>{children}</div>
    </>
  );
}
