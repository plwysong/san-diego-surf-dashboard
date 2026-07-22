CREATE TABLE `forecast_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`payload` text,
	`fetched_at` integer DEFAULT 0 NOT NULL,
	`fresh_until` integer DEFAULT 0 NOT NULL,
	`stale_until` integer DEFAULT 0 NOT NULL,
	`refresh_lock_until` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
