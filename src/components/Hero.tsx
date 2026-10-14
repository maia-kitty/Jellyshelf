import { FadeImg } from "./FadeImg";
import { Overview } from "./Overview";
import { StatusBadge, ListBadge } from "./StatusBadge";
import type { MediaStatus } from "@/db/schema";
import type { AniListStatus } from "@/lib/clients/anilist";

export function Hero(props: {
  title: string;
  original?: string | null;
  poster: string | null;
  backdrop: string | null;
  facts: (string | null | undefined | false)[];
  genres?: string[];
  overview?: string | null;
  status?: MediaStatus;
  list?: { status: AniListStatus; progress: number; total?: number | null };
  accentColor?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="bleed relative -mt-6 mb-8 overflow-hidden">
      {/* At most 480px, but never taller than the hero, so its fade to the page background always finishes inside it (a
          fixed 480px strip got cut off mid-fade under short heroes). Past 480px it stays put while content grows. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full max-h-[480px]">
        {props.backdrop && (
          <FadeImg src={props.backdrop} alt="" className="h-full w-full object-cover opacity-25" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-bg/30" />
      </div>
      <div className="rise-in relative flex flex-col gap-6 pb-6 pt-10 sm:flex-row">
        <div className="w-40 shrink-0 sm:w-52">
          {props.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.poster} alt="" className="aspect-[2/3] w-full rounded-xl border border-line bg-panel-2 object-cover shadow-2xl" style={{ borderColor: props.accentColor ?? undefined }} />
          ) : (
            <div className="aspect-[2/3] rounded-xl border border-line bg-panel-2" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-2">
            <StatusBadge status={props.status} className="text-xs" />
            {props.list && <ListBadge {...props.list} className="text-xs" />}
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
      </div>
    </div>
  );
}
