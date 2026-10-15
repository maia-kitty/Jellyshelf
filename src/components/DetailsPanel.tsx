/** Facts about a title, in the panel beside the hero text (where anime pages have "Your AniList"). */
export function DetailsPanel({
  facts,
  links,
}: {
  facts: [label: string, value: React.ReactNode][];
  links: { label: string; href: string }[];
}) {
  const shown = facts.filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <div className="rounded-2xl border border-line bg-panel/80 p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold">Details</h3>
        <span className="ml-auto flex gap-3">
          {links.map((l) => (
            <a key={l.href} className="text-xs text-accent hover:underline" href={l.href} target="_blank" rel="noreferrer">
              {l.label} ↗
            </a>
          ))}
        </span>
      </div>
      <dl className="divide-y divide-line/60 text-sm">
        {shown.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-1.5">
            <dt className="shrink-0 text-muted">{k}</dt>
            <dd className="min-w-0 text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
