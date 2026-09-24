CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`week_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`sent_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_key` ON `deliveries` (`week_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`user_id` text NOT NULL,
	`story_id` text NOT NULL,
	`rating` text,
	`saved` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_key` ON `feedback` (`user_id`,`story_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`kind` text NOT NULL,
	`group_name` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`last_checked` integer,
	`last_success` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_url` ON `sources` (`url`);--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`scope` text NOT NULL,
	`url` text NOT NULL,
	`title_original` text NOT NULL,
	`title_ru` text,
	`title_en` text,
	`fact_ru` text,
	`fact_en` text,
	`why_ru` text,
	`why_en` text,
	`action_ru` text,
	`action_en` text,
	`topics` text DEFAULT '[]' NOT NULL,
	`status_label` text DEFAULT 'Знать' NOT NULL,
	`body` text,
	`sources_json` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'published' NOT NULL,
	`important` integer DEFAULT 0 NOT NULL,
	`demo` integer DEFAULT 0 NOT NULL,
	`upload_id` text,
	`published_at` integer NOT NULL,
	`discovered_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stories_url` ON `stories` (`url`);--> statement-breakpoint
CREATE INDEX `stories_date` ON `stories` (`discovered_at`);--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`username` text,
	`role` text DEFAULT 'reader' NOT NULL,
	`language` text DEFAULT 'ru' NOT NULL,
	`topics` text DEFAULT '[]' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`digest` integer DEFAULT 0 NOT NULL,
	`bot_started` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weekly` (
	`id` text PRIMARY KEY NOT NULL,
	`title_ru` text NOT NULL,
	`title_en` text NOT NULL,
	`body_ru` text NOT NULL,
	`body_en` text NOT NULL,
	`story_ids` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL
);
