import { FadeImg } from "./FadeImg";
import { Overview } from "./Overview";
import { StatusBadge, ListBadge } from "./StatusBadge";
import type { MediaStatus } from "@/db/schema";
import type { AniListStatus } from "@/lib/clients/anilist";
import { sized } from "@/lib/img";

export function Hero(props: {
  title: string;
  original?: string | null;
  poster: string | null;
  backdrop: string | null;
  facts: React.ReactNode[];
  genres?: string[];
  overview?: string | null;
  status?: MediaStatus;
  list?: { status: AniListStatus; progress: number; total?: number | null };
  accentColor?: string | null;
  children?: React.ReactNode;
  /** Small controls at the end of the badge row above the title (the AniList | TMDB switch). */
  corner?: React.ReactNode;
  /** A panel to the right of the text on wide screens (below it on narrow ones). */
  aside?: React.ReactNode;
}) {
  return (
    <div className="bleed relative -mt-6 mb-8 overflow-hidden">
      {/* At most 480px, but never taller than the hero, so its fade to the page background always finishes inside it (a
          fixed 480px strip got cut off mid-fade under short heroes). Past 480px it stays put while content grows. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full max-h-[480px]">
        {props.backdrop && (
          <FadeImg {...sized(props.backdrop, 1600, "100vw")} alt="" className="h-full w-full object-cover opacity-25" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-bg/30" />
      </div>
      <div className="rise-in relative flex flex-col gap-6 pb-6 pt-10 sm:flex-row sm:flex-wrap lg:flex-nowrap">
        <div className="w-40 shrink-0 sm:w-52">
          {props.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img {...sized(props.poster, 208)} alt="" className="aspect-[2/3] w-full rounded-xl border border-line bg-panel-2 object-cover shadow-2xl" style={{ borderColor: props.accentColor ?? undefined }} />
          ) : (
            <div className="aspect-[2/3] rounded-xl border border-line bg-panel-2" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {/* A badge's height even when empty: one turning up (a request) mustn't push the whole column down. */}
          <div className="mb-2 flex min-h-5 flex-wrap items-center gap-2">
            <StatusBadge status={props.status} className="chip-in text-xs" />
            {props.list && <ListBadge {...props.list} className="text-xs" />}
            {props.corner && <div className="ml-auto">{props.corner}</div>}
          </div>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{props.title}</h1>
          {props.original && props.original !== props.title && <div className="mt-1 text-muted">{props.original}</div>}
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
            {props.facts.filter(Boolean).map((f, i) => (
              <span key={i}>{f}</span>
            ))}
          </div>
          {!!props.genres?.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {props.genres.map((g) => (
                <span key={g} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
                  {g}
                </span>
              ))}
            </div>
          )}
          {props.overview && <Overview text={props.overview} />}
          {props.children && <div className="mt-5">{props.children}</div>}
        </div>
        {/* Wide: a third column. Tablet: no room beside the poster, so it wraps onto its own line. */}
        {/* The width cap sits on the inner box: on the outer one it would let the panel squeeze onto the poster's line. */}
        {props.aside && (
          <div className="w-full shrink-0 sm:basis-full lg:w-80 lg:basis-auto">
            <div className="sm:max-w-md lg:max-w-none">{props.aside}</div>
          </div>
        )}
      </div>
    </div>
  );
}
