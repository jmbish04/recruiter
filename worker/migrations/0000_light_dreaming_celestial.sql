CREATE TABLE `application_materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`is_sample_block` integer DEFAULT false NOT NULL,
	`title` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `candidate_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_text` text NOT NULL,
	`preferences_text` text NOT NULL,
	`min_score` integer DEFAULT 60 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`career_url` text NOT NULL,
	`job_link_pattern` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_evaluations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`ai_score` integer,
	`human_overall_score` integer,
	`human_location_score` integer,
	`human_salary_score` integer,
	`human_benefits_score` integer,
	`feedback_notes` text,
	`evaluated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_evaluations_job_id_unique` ON `job_evaluations` (`job_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
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
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_job_url_unique` ON `jobs` (`job_url`);