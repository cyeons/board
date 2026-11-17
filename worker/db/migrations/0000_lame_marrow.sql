CREATE TABLE `admin_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`session_version` integer DEFAULT 1 NOT NULL,
	`password_hash` text,
	`password_salt` text
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`kind` text NOT NULL,
	`file_id` text,
	`url` text,
	`link_title` text,
	`link_description` text,
	`link_image` text,
	`link_site` text,
	`link_provider` text,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attachments_post` ON `attachments` (`post_id`,`position`);--> statement-breakpoint
CREATE INDEX `attachments_file` ON `attachments` (`file_id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`lecture_id` text NOT NULL,
	`sort_key` text NOT NULL,
	`emoji` text DEFAULT '📌' NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`visible` integer DEFAULT 0 NOT NULL,
	`has_assignment` integer DEFAULT 1 NOT NULL,
	`assignment_due_at` integer,
	`assignment_visibility` text DEFAULT 'public' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `cards_lecture_sort` ON `cards` (`lecture_id`,`sort_key`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`author_type` text NOT NULL,
	`participant_id` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `comments_post_created` ON `comments` (`post_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_participant_created` ON `comments` (`participant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `course_slugs` (
	`slug` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`is_current` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`instructor_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_slug_unique` ON `courses` (`slug`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`thumb_r2_key` text,
	`thumb_size` integer,
	`category` text NOT NULL,
	`uploader_type` text NOT NULL,
	`uploader_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `files_course_category` ON `files` (`course_id`,`category`);--> statement-breakpoint
CREATE INDEX `files_uploader_created` ON `files` (`uploader_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`color_index` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `groups_course` ON `groups` (`course_id`,`position`);--> statement-breakpoint
CREATE TABLE `help_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`lecture_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`kind` text NOT NULL,
	`message` text,
	`file_id` text,
	`status` text DEFAULT 'waiting' NOT NULL,
	`created_at` integer NOT NULL,
	`handled_at` integer
);
--> statement-breakpoint
CREATE INDEX `help_course_status_created` ON `help_requests` (`course_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `help_participant_created` ON `help_requests` (`participant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `help_file` ON `help_requests` (`file_id`);--> statement-breakpoint
CREATE TABLE `lectures` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`cover_file_id` text,
	`published` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'before' NOT NULL,
	`opened_at` integer,
	`closed_at` integer,
	`auto_closed` integer DEFAULT 0 NOT NULL,
	`notice_post_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `lectures_course_date` ON `lectures` (`course_id`,`date`);--> statement-breakpoint
CREATE TABLE `likes` (
	`post_id` text NOT NULL,
	`liker_key` text NOT NULL,
	`is_instructor` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`post_id`, `liker_key`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`ip_hash` text PRIMARY KEY NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`public_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`nickname` text NOT NULL,
	`group_id` text,
	`avatar_color` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_public_id_unique` ON `participants` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `participants_token_hash_unique` ON `participants` (`token_hash`);--> statement-breakpoint
CREATE INDEX `participants_course` ON `participants` (`course_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text,
	`lecture_id` text NOT NULL,
	`tab` text NOT NULL,
	`author_type` text NOT NULL,
	`participant_id` text,
	`group_id` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`sort_key` text,
	`pinned_at` integer,
	`is_late` integer DEFAULT 0 NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`instructor_liked` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `posts_card_tab_created` ON `posts` (`card_id`,`tab`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_card_group` ON `posts` (`card_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `posts_participant_created` ON `posts` (`participant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_lecture` ON `posts` (`lecture_id`);