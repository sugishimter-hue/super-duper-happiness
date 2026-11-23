CREATE TABLE IF NOT EXISTS `operating_policy` (
	`id` integer PRIMARY KEY,
	`policy` text NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `login_attempts` (
	`ip` text PRIMARY KEY,
	`fails` integer NOT NULL,
	`locked_until` integer NOT NULL
);
