/** Shown under the library switcher while a library loads. */
export default function LibraryLoading() {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7" aria-label="Loading">
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] rounded-xl bg-panel-2" />
          <div className="mt-2 h-3.5 w-3/4 rounded bg-panel-2" />
          <div className="mt-1.5 h-3 w-1/3 rounded bg-panel-2" />
        </div>
      ))}
    </div>
  );
}
