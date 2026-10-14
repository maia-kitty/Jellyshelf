import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/db";

const arrBase = z.object({
  url: z.string().default(""),
  apiKey: z.string().default(""),
  qualityProfileId: z.number().nullable().default(null),
  rootFolder: z.string().default(""),
});

export const settingsSchema = z.object({
  general: z
    .object({
      appUrl: z.string().default("http://localhost:3000"),
      setupComplete: z.boolean().default(false),
      /** Default auto-approve for new non-admin users. */
      defaultAutoApprove: z.boolean().default(false),
    })
    .prefault({}),
  tmdb: z.object({ apiKey: z.string().default("") }).prefault({}),
  anilist: z
    .object({
      clientId: z.string().default(""),
      clientSecret: z.string().default(""),
      /** Add requested anime to the requester's AniList Planning list. */
      writeBack: z.boolean().default(true),
    })
    .prefault({}),
  sonarr: arrBase
    .extend({
      languageProfileId: z.number().nullable().default(null),
      animeQualityProfileId: z.number().nullable().default(null),
      animeRootFolder: z.string().default(""),
      seasonFolder: z.boolean().default(true),
    })
    .prefault({}),
  radarr: arrBase
    .extend({
      animeQualityProfileId: z.number().nullable().default(null),
      animeRootFolder: z.string().default(""),
      minimumAvailability: z.enum(["announced", "inCinemas", "released"]).default("released"),
    })
    .prefault({}),
  jellyfin: z
    .object({
      url: z.string().default(""),
      apiKey: z.string().default(""),
      /** Allow logging in with Jellyfin credentials. */
      allowLogin: z.boolean().default(true),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsSection = keyof Settings;

const g = globalThis as unknown as { __kitsuneSettings?: Settings };

export async function getSettings(): Promise<Settings> {
  if (g.__kitsuneSettings) return g.__kitsuneSettings;
  await ensureMigrated();
  const rows = await db.select().from(schema.settings);
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return (g.__kitsuneSettings = settingsSchema.parse(raw));
}

export async function updateSettings<K extends SettingsSection>(section: K, patch: Partial<Settings[K]>) {
  const current = await getSettings();
  const next = settingsSchema.shape[section].parse({ ...current[section], ...patch }) as Settings[K];
  await db
    .insert(schema.settings)
    .values({ key: section, value: next })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next } });
  g.__kitsuneSettings = { ...current, [section]: next };
  return next;
}

/** Strip secrets before sending settings to the browser; keep a flag saying whether one is set. */
export function redactSettings(s: Settings) {
  const mask = (v: string) => (v ? "••••••••" : "");
  return {
    ...s,
    tmdb: { apiKey: mask(s.tmdb.apiKey) },
    anilist: { ...s.anilist, clientSecret: mask(s.anilist.clientSecret) },
    sonarr: { ...s.sonarr, apiKey: mask(s.sonarr.apiKey) },
    radarr: { ...s.radarr, apiKey: mask(s.radarr.apiKey) },
    jellyfin: { ...s.jellyfin, apiKey: mask(s.jellyfin.apiKey) },
  };
}

export const MASK = "••••••••";

export async function getSetting<K extends SettingsSection>(section: K): Promise<Settings[K]> {
  return (await getSettings())[section];
}

export async function deleteSetting(section: SettingsSection) {
  await db.delete(schema.settings).where(eq(schema.settings.key, section));
  g.__kitsuneSettings = undefined;
}
