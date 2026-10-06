CREATE TABLE `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`publisher` text DEFAULT '' NOT NULL,
	`year` text DEFAULT '' NOT NULL,
	`isbn` text DEFAULT '' NOT NULL,
	`call_number` text DEFAULT '' NOT NULL,
	`edition` text DEFAULT '' NOT NULL,
	`language` text DEFAULT '' NOT NULL,
	`saved_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_source_id_idx` ON `books` (`source_id`);