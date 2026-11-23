CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`topic` text NOT NULL,
	`time` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '신규' NOT NULL,
	`assignee` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`revenue` integer DEFAULT 0 NOT NULL,
	`consent_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_requests_created` ON `requests` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_requests_expires` ON `requests` (`expires_at`);