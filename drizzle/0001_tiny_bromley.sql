CREATE TABLE `forecast_history` (
	`issued_at` integer PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`payload` text NOT NULL
);
