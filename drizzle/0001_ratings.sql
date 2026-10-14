CREATE TABLE `ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`anilist_id` integer,
	`title` text NOT NULL,
	`scores` text NOT NULL,
	`total` integer NOT NULL,
	`rated_on` text NOT NULL,
	`pushed_to_anilist` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ratings_user` ON `ratings` (`user_id`);--> statement-breakpoint
CREATE INDEX `ratings_anilist` ON `ratings` (`anilist_id`);