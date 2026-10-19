import { z } from "zod";
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
      /** Address your browser uses for Jellyfin (for "Play" links), if different from the URL Jellyshelf uses. */
      publicUrl: z.string().default(""),
    })
    .prefault({}),
  bazarr: z
    .object({
      url: z.string().default(""),
      apiKey: z.string().default(""),
      /** Who may search for and pick subtitles: admins only, or also whoever requested the title. */
      fixSubsBy: z.enum(["admin", "requesters"]).default("requesters"),
    })
    .prefault({}),
  qbittorrent: z
    .object({
      url: z.string().default(""),
      username: z.string().default(""),
      password: z.string().default(""),
    })
    .prefault({}),
  ntfy: z
    .object({
      url: z.string().default(""),
      /** Access token, if the ntfy server doesn't let anyone publish. */
      token: z.string().default(""),
      /** Phones subscribe at ntfy itself (it's reachable from anywhere, e.g. ntfy.sh) rather than through Jellyshelf. */
      direct: z.boolean().default(false),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsSection = keyof Settings;

const g = globalThis as unknown as { __jellyshelfSettings?: Settings };

export async function getSettings(): Promise<Settings> {
  if (g.__jellyshelfSettings) return g.__jellyshelfSettings;
  await ensureMigrated();
  const rows = await db.select().from(schema.settings);
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return (g.__jellyshelfSettings = settingsSchema.parse(raw));
}

export async function updateSettings<K extends SettingsSection>(section: K, patch: Partial<Settings[K]>) {
  const current = await getSettings();
  const next = settingsSchema.shape[section].parse({ ...current[section], ...patch }) as Settings[K];
  await db
    .insert(schema.settings)
    .values({ key: section, value: next })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next } });
  g.__jellyshelfSettings = { ...current, [section]: next };
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
    bazarr: { ...s.bazarr, apiKey: mask(s.bazarr.apiKey) },
    ntfy: { ...s.ntfy, token: mask(s.ntfy.token) },
    qbittorrent: { ...s.qbittorrent, password: mask(s.qbittorrent.password) },
  };
}

export const MASK = "••••••••";

export async function getSetting<K extends SettingsSection>(section: K): Promise<Settings[K]> {
  return (await getSettings())[section];
}

