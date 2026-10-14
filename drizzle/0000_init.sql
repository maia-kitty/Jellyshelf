CREATE TABLE `id_mapping` (
	`anilist_id` integer PRIMARY KEY NOT NULL,
	`anidb_id` integer,
	`mal_id` integer,
	`tvdb_id` integer,
	`tmdb_movie_id` integer,
	`tmdb_tv_id` integer,
	`imdb_id` text,
	`type` text,
	`tvdb_season` integer,
	`episode_offset` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idmap_tvdb` ON `id_mapping` (`tvdb_id`);--> statement-breakpoint
CREATE INDEX `idmap_tmdb_movie` ON `id_mapping` (`tmdb_movie_id`);--> statement-breakpoint
CREATE INDEX `idmap_tmdb_tv` ON `id_mapping` (`tmdb_tv_id`);--> statement-breakpoint
CREATE TABLE `id_mapping_override` (
	`anilist_id` integer PRIMARY KEY NOT NULL,
	`tvdb_id` integer,
	`tmdb_movie_id` integer,
	`tvdb_season` integer,
	`episode_offset` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`poster` text,
	`format` text,
	`episodes` integer,
	`tmdb_id` integer,
	`tvdb_id` integer,
	`anilist_id` integer,
	`status` text DEFAULT 'unknown' NOT NULL,
	`season_status` text,
	`jellyfin_item_id` text,
	`sonarr_id` integer,
	`radarr_id` integer,
	`last_synced` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_kind_tmdb` ON `media` (`kind`,`tmdb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_anilist` ON `media` (`anilist_id`);--> statement-breakpoint
CREATE INDEX `media_tvdb` ON `media` (`tvdb_id`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`seasons` text,
	`episode_ranges` text,
	`target` text NOT NULL,
	`target_id` integer NOT NULL,
	`absolute` integer DEFAULT false NOT NULL,
	`needs_episode_sync` integer DEFAULT false NOT NULL,
	`error` text,
	`decided_by` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `requests_status` ON `requests` (`status`);--> statement-breakpoint
CREATE INDEX `requests_user` ON `requests` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`display_name` text NOT NULL,
	`avatar` text,
	`role` text DEFAULT 'user' NOT NULL,
	`anilist_id` integer,
	`anilist_token` text,
	`anilist_token_expires` integer,
	`jellyfin_user_id` text,
	`auto_approve_movie` integer DEFAULT false NOT NULL,
	`auto_approve_tv` integer DEFAULT false NOT NULL,
	`auto_approve_anime` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_anilist_id_unique` ON `users` (`anilist_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_jellyfin_user_id_unique` ON `users` (`jellyfin_user_id`);