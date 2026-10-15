import { ShelfHeader } from "./MediaCard";

/** Same footprint as a CardRow, with its real title, while the cards load. */
export function RowSkeleton({ title, count = 9 }: { title: React.ReactNode; count?: number }) {
  return (
    <section className="mb-10" aria-busy="true">
      <ShelfHeader title={title} />
      <div className="-mx-1 flex gap-4 overflow-hidden px-1 pb-3 pt-1.5">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="w-36 shrink-0 sm:w-40">
            <div className="shimmer aspect-[2/3] rounded-xl" style={{ animationDelay: `${i * 80}ms` }} />
            <div className="shimmer mt-2 h-3.5 w-4/5 rounded" style={{ animationDelay: `${i * 80}ms` }} />
            <div className="shimmer mt-1.5 h-3 w-2/5 rounded" style={{ animationDelay: `${i * 80}ms` }} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function WideRowSkeleton({ title, count = 4 }: { title: React.ReactNode; count?: number }) {
  return (
    <section className="mb-10" aria-busy="true">
      <ShelfHeader title={title} />
      <div className="-mx-1 flex gap-4 overflow-hidden px-1 pb-3 pt-1.5">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="shimmer h-36 w-72 shrink-0 rounded-xl sm:w-80" style={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
    </section>
  );
}

export function ScheduleSkeleton() {
  return (
    <section className="mb-10" aria-busy="true">
      <ShelfHeader title="This week" />
      <div className="-mx-1 grid auto-cols-[minmax(11rem,1fr)] grid-flow-col gap-3 overflow-hidden px-1 pb-3">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="shimmer h-64 rounded-xl" style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
    </section>
  );
}

/** Holds the spotlight's space (same height and bleed) so the page doesn't jump when it arrives. */
export function SpotlightSkeleton() {
  return (
    <section className="bleed relative -mt-6 mb-10 overflow-hidden" aria-busy="true">
      <div className="shimmer absolute inset-0 opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
      <div className="relative flex min-h-[340px] items-end gap-6 pb-10 pt-16 sm:min-h-[420px] sm:px-8 min-[1720px]:px-0">
        <div className="hidden w-36 md:block">
          <div className="shimmer aspect-[2/3] rounded-xl" />
        </div>
        <div className="w-full max-w-2xl space-y-3">
          <div className="shimmer h-3 w-28 rounded" />
          <div className="shimmer h-9 w-3/4 rounded-lg" />
          <div className="shimmer h-3 w-1/3 rounded" />
          <div className="shimmer h-14 w-full rounded-lg" />
          <div className="shimmer h-10 w-36 rounded-lg" />
        </div>
      </div>
    </section>
  );
}
