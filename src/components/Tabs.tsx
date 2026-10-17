import Link from "next/link";

export { Tabs } from "./PillTabs";

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
