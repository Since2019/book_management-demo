DROP INDEX `books_source_id_idx`;--> statement-breakpoint
ALTER TABLE `books` ADD `tags` text DEFAULT '' NOT NULL;