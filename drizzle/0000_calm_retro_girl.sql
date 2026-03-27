CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`career_url` text,
	`job_link_pattern` text
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer,
	`job_url` text NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`salary` text,
	`compensation` text,
	`equity` text,
	`bonus` text,
	`requirements` text,
	`benefits` text,
	`health_benefits` text,
	`financial_benefits` text,
	`time_off` text,
	`description` text,
	`last_seen_date` text,
	`relevancy_score` integer DEFAULT 0,
	`processed_for_resume` integer DEFAULT false,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`candidate_profile` text,
	`job_preferences` text,
	`min_score` integer DEFAULT 80
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_job_url_unique` ON `jobs` (`job_url`);