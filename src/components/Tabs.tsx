import Link from "next/link";
import clsx from "clsx";

export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={clsx(
            "rounded-full border px-3.5 py-1.5 text-sm transition",
            t.key === active ? "border-accent bg-accent/15 text-fg" : "border-line text-muted hover:text-fg",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Pager({ page, hasNext, href }: { page: number; hasNext: boolean; href: (p: number) => string }) {
  return (
    <div className="mt-10 flex items-center justify-center gap-3">
      {page > 1 && (
        <Link className="btn-ghost" href={href(page - 1)}>
          ← Previous
        </Link>
      )}
      <span className="text-sm text-muted">Page {page}</span>
      {hasNext && (
        <Link className="btn-ghost" href={href(page + 1)}>
          Next →
        </Link>
      )}
    </div>
  );
}
