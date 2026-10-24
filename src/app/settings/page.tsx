import Link from "next/link";
import { headers } from "next/headers";
import clsx from "clsx";
import { db, schema } from "@/db";
import {
  AniListSettings,
  BazarrSettings,
  CopyField,
  GeneralSettings,
  JellyfinSettings,
  JobButtons,
  NtfySettings,
  QbittorrentSettings,
  RadarrSettings,
  Section,
  SonarrSettings,
  TmdbSettings,
  UsersTable,
} from "@/components/Settings";
import { ManageLibrary } from "@/components/ManageLibrary";
import { managedTitles } from "@/lib/manage";
import { mappingCount } from "@/lib/mapping";
import { pageAdmin, param, type SearchParams } from "@/lib/page";
import { getSettings, redactSettings, type Settings } from "@/lib/settings";
import { webhookToken } from "@/lib/webhooks";

/** The sidebar: every page of settings, grouped. `on` says whether a service is set up (a dot next to it). */
const GROUPS: { label: string; items: { key: string; label: string; on?: (s: Settings) => boolean }[] }[] = [
  {
    label: "Services",
    items: [
      { key: "jellyfin", label: "Jellyfin", on: (s) => !!(s.jellyfin.url && s.jellyfin.apiKey) },
      { key: "sonarr", label: "Sonarr", on: (s) => !!(s.sonarr.url && s.sonarr.apiKey) },
      { key: "radarr", label: "Radarr", on: (s) => !!(s.radarr.url && s.radarr.apiKey) },
      { key: "bazarr", label: "Bazarr", on: (s) => !!(s.bazarr.url && s.bazarr.apiKey) },
      { key: "qbittorrent", label: "qBittorrent", on: (s) => !!s.qbittorrent.url },
      { key: "ntfy", label: "Notifications", on: (s) => !!s.ntfy.url },
    ],
  },
  {
    label: "Sign-in & data",
    items: [
      { key: "general", label: "General" },
      { key: "tmdb", label: "TMDB", on: (s) => !!s.tmdb.apiKey },
      { key: "anilist", label: "AniList", on: (s) => !!s.anilist.clientId },
    ],
  },
  {
    label: "Admin",
    items: [
      { key: "users", label: "Users" },
      { key: "library", label: "Manage library" },
      { key: "system", label: "Jobs & webhooks" },
    ],
  },
];

/** Older links went to a tab that held several of these. */
const OLD_TABS: Record<string, string> = { services: "jellyfin" };

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await pageAdmin();
  const asked = param(await searchParams, "tab") ?? "jellyfin";
  const tab = OLD_TABS[asked] ?? asked;
  const raw = await getSettings();
  const s = redactSettings(raw);
  const base = s.general.appUrl.replace(/\/+$/, "") || `http://${(await headers()).get("host")}`;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
        {/* A scrolling row of links on phones, a sidebar from lg up. */}
        <nav className="scroll-row -mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:block lg:space-y-5 lg:self-start lg:overflow-visible lg:px-0">
          {GROUPS.map((g) => (
            <div key={g.label} className="contents lg:block">
              <div className="mb-1.5 hidden px-3 text-[11px] font-medium uppercase tracking-wide text-muted lg:block">{g.label}</div>
              {g.items.map((it) => (
                <Link
                  key={it.key}
                  href={`/settings?tab=${it.key}`}
                  aria-current={tab === it.key ? "page" : undefined}
                  className={clsx(
                    "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
                    tab === it.key ? "bg-panel-2 text-fg" : "text-muted hover:bg-panel-2/60 hover:text-fg",
                  )}
                >
                  {it.on && <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", it.on(raw) ? "bg-ok" : "bg-line")} title={it.on(raw) ? "Set up" : "Not set up"} />}
                  {it.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="min-w-0">
          {tab === "jellyfin" && <JellyfinSettings initial={s.jellyfin} />}
          {tab === "sonarr" && <SonarrSettings initial={s.sonarr} />}
          {tab === "radarr" && <RadarrSettings initial={s.radarr} />}
          {tab === "bazarr" && <BazarrSettings initial={s.bazarr} />}
          {tab === "qbittorrent" && <QbittorrentSettings initial={s.qbittorrent} />}
          {tab === "ntfy" && <NtfySettings initial={s.ntfy} />}
          {tab === "general" && <GeneralSettings initial={s.general} />}
          {tab === "tmdb" && <TmdbSettings initial={s.tmdb} />}
          {tab === "anilist" && <AniListSettings initial={s.anilist} appUrl={s.general.appUrl} />}
          {tab === "users" && (
            <Section title="Users" desc="Everyone who has signed in. Admins and auto-approved requests skip the approval queue.">
              <UsersTable
                selfId={admin.id}
                users={(await db.select().from(schema.users)).map((u) => ({
                  id: u.id,
                  displayName: u.displayName,
                  avatar: u.avatar,
                  role: u.role,
                  anilist: !!u.anilistId,
                  jellyfin: !!u.jellyfinUserId,
                  autoApproveMovie: u.autoApproveMovie,
                  autoApproveTv: u.autoApproveTv,
                  autoApproveAnime: u.autoApproveAnime,
                }))}
              />
            </Section>
          )}
          {tab === "library" && (
            <Section title="Manage library" desc="Everything in Sonarr and Radarr, biggest first. Deleting removes the files too.">
              <ManageLibrary {...await managedTitles()} qbit={!!s.qbittorrent.url} />
            </Section>
          )}
          {tab === "system" && (
            <>
              <Section title="Jobs" desc="These run on their own; run one now if you don't want to wait.">
                <JobButtons mappingCount={await mappingCount()} />
              </Section>
              <Section
                title="Webhooks"
                desc="Optional. Availability then updates within seconds of an import, instead of on the 10-minute sync."
                more={
                  <p>
                    Sonarr/Radarr: Settings → Connect → Webhook, with the events “On Import” and “On Upgrade”. Jellyfin: the Webhook plugin → Generic
                    destination, with “Item Added”.
                  </p>
                }
              >
                {(["sonarr", "radarr", "jellyfin"] as const).map((svc) => (
                  <CopyField key={svc} label={svc} value={`${base}/api/webhooks/${svc}?token=${webhookToken()}`} />
                ))}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
