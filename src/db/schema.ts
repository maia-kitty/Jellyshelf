import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export type MediaKind = "movie" | "tv" | "anime";
export type MediaStatus = "unknown" | "pending" | "processing" | "partially_available" | "available";
export type RequestStatus = "pending" | "approved" | "declined" | "failed" | "completed";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
};

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  displayName: text("display_name").notNull(),
  avatar: text("avatar"),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  anilistId: integer("anilist_id").unique(),
  anilistToken: text("anilist_token"), // AES-GCM encrypted
  anilistTokenExpires: integer("anilist_token_expires", { mode: "timestamp" }),
  /** The user's own Jellyfin access token (AES-GCM encrypted), for playback as them. */
  jellyfinToken: text("jellyfin_token"),
  jellyfinUserId: text("jellyfin_user_id").unique(),
  autoApproveMovie: integer("auto_approve_movie", { mode: "boolean" }).notNull().default(false),
  autoApproveTv: integer("auto_approve_tv", { mode: "boolean" }).notNull().default(false),
  autoApproveAnime: integer("auto_approve_anime", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const media = sqliteTable(
  "media",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: ["movie", "tv", "anime"] }).notNull(),
    title: text("title").notNull(),
    poster: text("poster"),
    /** AniList format (TV, MOVIE, ONA, ...) and episode count, for anime rows. */
    format: text("format"),
    episodes: integer("episodes"),
    tmdbId: integer("tmdb_id"),
    tvdbId: integer("tvdb_id"),
    anilistId: integer("anilist_id"),
    status: text("status", { enum: ["unknown", "pending", "processing", "partially_available", "available"] })
      .notNull()
      .default("unknown"),
    /** Per-season availability for TV/anime, e.g. {"1":"available","2":"processing"} */
    seasonStatus: text("season_status", { mode: "json" }).$type<Record<string, MediaStatus>>(),
    jellyfinItemId: text("jellyfin_item_id"),
    sonarrId: integer("sonarr_id"),
    radarrId: integer("radarr_id"),
    lastSynced: integer("last_synced", { mode: "timestamp" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("media_kind_tmdb").on(t.kind, t.tmdbId),
    uniqueIndex("media_anilist").on(t.anilistId),
    index("media_tvdb").on(t.tvdbId),
  ],
);

export type ServiceTarget = "sonarr" | "radarr";

export const requests = sqliteTable(
  "requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mediaId: integer("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "approved", "declined", "failed", "completed"] })
      .notNull()
      .default("pending"),
    /** TVDB season numbers requested (tv / anime-tv). */
    seasons: text("seasons", { mode: "json" }).$type<number[]>(),
    /** For anime: absolute episode ranges when the mapping uses absolute numbering. */
    episodeRanges: text("episode_ranges", { mode: "json" }).$type<{ from: number; to: number | null }[]>(),
    target: text("target", { enum: ["sonarr", "radarr"] }).notNull(),
    /** TVDB id (sonarr) or TMDB movie id (radarr) the request resolved to. */
    targetId: integer("target_id").notNull(),
    /** Anime with absolute episode numbering (episodeRanges are absolute numbers). */
    absolute: integer("absolute", { mode: "boolean" }).notNull().default(false),
    /** Episode-level monitoring still has to be applied (Sonarr hadn't populated episodes yet). */
    needsEpisodeSync: integer("needs_episode_sync", { mode: "boolean" }).notNull().default(false),
    error: text("error"),
    decidedBy: integer("decided_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("requests_status").on(t.status), index("requests_user").on(t.userId)],
);

/** Rows from Fribb/anime-lists anime-list-full.json, joined with Anime-Lists XML season data. */
export const idMapping = sqliteTable(
  "id_mapping",
  {
    anilistId: integer("anilist_id").primaryKey(),
    anidbId: integer("anidb_id"),
    malId: integer("mal_id"),
    tvdbId: integer("tvdb_id"),
    tmdbMovieId: integer("tmdb_movie_id"),
    tmdbTvId: integer("tmdb_tv_id"),
    imdbId: text("imdb_id"),
    type: text("type"), // TV, MOVIE, OVA, ONA, SPECIAL, ...
    /** TVDB season number; null when unknown, -1 for absolute numbering, 0 for specials. */
    tvdbSeason: integer("tvdb_season"),
    /** Episode offset inside that TVDB season (or absolute numbering). */
    episodeOffset: integer("episode_offset").notNull().default(0),
  },
  (t) => [index("idmap_tvdb").on(t.tvdbId), index("idmap_tmdb_movie").on(t.tmdbMovieId), index("idmap_tmdb_tv").on(t.tmdbTvId)],
);

/** Admin-confirmed overrides; always win over idMapping. */
export const idMappingOverride = sqliteTable("id_mapping_override", {
  anilistId: integer("anilist_id").primaryKey(),
  tvdbId: integer("tvdb_id"),
  tmdbMovieId: integer("tmdb_movie_id"),
  tvdbSeason: integer("tvdb_season"),
  episodeOffset: integer("episode_offset").notNull().default(0),
  ...timestamps,
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Request = typeof requests.$inferSelect;
export type IdMapping = typeof idMapping.$inferSelect;

/** Personal rubric ratings (see lib/rating.ts). Several rows per anime = re-ratings; latest wins. */
export const ratings = sqliteTable(
  "ratings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    anilistId: integer("anilist_id"),
    title: text("title").notNull(),
    /** category name → points */
    scores: text("scores", { mode: "json" }).notNull().$type<Record<string, number>>(),
    total: integer("total").notNull(),
    /** ISO date (YYYY-MM-DD), as in the CSV log. */
    ratedOn: text("rated_on").notNull(),
    pushedToAnilist: integer("pushed_to_anilist", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("ratings_user").on(t.userId), index("ratings_anilist").on(t.anilistId)],
);

export type Rating = typeof ratings.$inferSelect;
