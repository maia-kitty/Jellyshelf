import { headers } from "next/headers";
import { db, schema } from "@/db";
import {
  AniListSettings,
  GeneralSettings,
  JellyfinSettings,
  JobButtons,
  RadarrSettings,
  Section,
  SonarrSettings,
  TmdbSettings,
  UsersTable,
} from "@/components/Settings";
import { Tabs } from "@/components/Tabs";
import { mappingCount } from "@/lib/mapping";
import { pageAdmin, param, type SearchParams } from "@/lib/page";
import { getSettings, redactSettings } from "@/lib/settings";
import { webhookToken } from "@/lib/webhooks";

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await pageAdmin();
  const tab = param(await searchParams, "tab") ?? "services";
  const s = redactSettings(await getSettings());
  const base = s.general.appUrl.replace(/\/+$/, "") || `http://${(await headers()).get("host")}`;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-bold">Settings</h1>
      <Tabs
        active={tab}
        tabs={[
          { key: "services", label: "Services", href: "/settings?tab=services" },
          { key: "general", label: "General & sign-in", href: "/settings?tab=general" },
          { key: "users", label: "Users", href: "/settings?tab=users" },
          { key: "system", label: "Jobs & webhooks", href: "/settings?tab=system" },
          { key: "debug", label: "Debug", href: "/debug" },
        ]}
      />
      {tab === "services" && (
        <>
          <SonarrSettings initial={s.sonarr} />
          <RadarrSettings initial={s.radarr} />
          <JellyfinSettings initial={s.jellyfin} />
        </>
      )}
      {tab === "general" && (
        <>
          <GeneralSettings initial={s.general} />
          <TmdbSettings initial={s.tmdb} />
          <AniListSettings initial={s.anilist} appUrl={s.general.appUrl} />
        </>
      )}
      {tab === "users" && (
        <Section title="Users" desc="Admins and auto-approved users skip the approval queue.">
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
      {tab === "system" && (
        <>
          <Section title="Jobs">
            <JobButtons mappingCount={await mappingCount()} />
          </Section>
          <Section
            title="Webhooks"
            desc="Optional: makes availability update within seconds of an import instead of on the 10-minute sync."
          >
            {(["sonarr", "radarr", "jellyfin"] as const).map((svc) => (
              <div key={svc}>
                <span className="label">{svc}</span>
                <code className="block break-all rounded-lg bg-panel-2 p-2 text-xs">
                  {base}/api/webhooks/{svc}?token={webhookToken()}
                </code>
              </div>
            ))}
            <p className="text-xs text-muted">
              Sonarr/Radarr: Settings → Connect → Webhook, events “On Import” and “On Upgrade”. Jellyfin: Webhook plugin → Generic
              destination, “Item Added”.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
