CREATE TABLE `auth_identities` (
	`provider` varchar(16) NOT NULL,
	`platform_uid` varchar(128) NOT NULL,
	`player_id` bigint unsigned NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_identities_provider_platform_uid_pk` PRIMARY KEY(`provider`,`platform_uid`)
);
--> statement-breakpoint
CREATE TABLE `battle_results` (
	`battle_id` varchar(36) NOT NULL,
	`player_id` bigint unsigned NOT NULL,
	`result` varchar(8) NOT NULL,
	`difficulty_id` int unsigned NOT NULL,
	`config_version` varchar(64) NOT NULL,
	`stars_before` int unsigned NOT NULL,
	`stars_after` int unsigned NOT NULL,
	`reward_json` json NOT NULL,
	`started_at` timestamp NOT NULL,
	`finished_at` timestamp NOT NULL,
	CONSTRAINT `battle_results_battle_id` PRIMARY KEY(`battle_id`)
);
--> statement-breakpoint
CREATE TABLE `hero_progress` (
	`player_id` bigint unsigned NOT NULL,
	`hero_key` varchar(32) NOT NULL,
	`level` int unsigned NOT NULL,
	`shards` int unsigned NOT NULL,
	`unlocked` boolean NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hero_progress_player_id_hero_key_pk` PRIMARY KEY(`player_id`,`hero_key`)
);
--> statement-breakpoint
CREATE TABLE `player_public_ids` (
	`public_id` int unsigned NOT NULL,
	`assigned_player_id` bigint unsigned,
	`assigned_at` timestamp,
	CONSTRAINT `player_public_ids_public_id` PRIMARY KEY(`public_id`),
	CONSTRAINT `player_public_ids_assigned_uq` UNIQUE(`assigned_player_id`)
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` bigint unsigned NOT NULL,
	`public_id` int unsigned NOT NULL,
	`nickname` varchar(19) NOT NULL,
	`discriminator` varchar(4) NOT NULL,
	`avatar_id` tinyint NOT NULL,
	`coins` bigint unsigned NOT NULL,
	`net_stars` int unsigned NOT NULL,
	`matches` int unsigned NOT NULL,
	`merit` int unsigned NOT NULL,
	`season_id` varchar(32) NOT NULL,
	`lineup_json` json NOT NULL,
	`config_version` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `players_id` PRIMARY KEY(`id`),
	CONSTRAINT `players_public_id_uq` UNIQUE(`public_id`),
	CONSTRAINT `players_display_name_uq` UNIQUE(`nickname`,`discriminator`)
);
--> statement-breakpoint
CREATE TABLE `reward_claims` (
	`player_id` bigint unsigned NOT NULL,
	`season_id` varchar(32) NOT NULL,
	`reward_type` varchar(24) NOT NULL,
	`reward_id` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reward_claims_player_id_season_id_reward_type_reward_id_pk` PRIMARY KEY(`player_id`,`season_id`,`reward_type`,`reward_id`)
);
--> statement-breakpoint
ALTER TABLE `auth_identities` ADD CONSTRAINT `auth_identities_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `battle_results` ADD CONSTRAINT `battle_results_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hero_progress` ADD CONSTRAINT `hero_progress_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_public_ids` ADD CONSTRAINT `player_public_ids_assigned_player_id_players_id_fk` FOREIGN KEY (`assigned_player_id`) REFERENCES `players`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reward_claims` ADD CONSTRAINT `reward_claims_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_player_idx` ON `auth_identities` (`player_id`);--> statement-breakpoint
CREATE INDEX `battle_player_finished_idx` ON `battle_results` (`player_id`,`finished_at`);--> statement-breakpoint
CREATE INDEX `battle_finished_idx` ON `battle_results` (`finished_at`);--> statement-breakpoint
CREATE INDEX `players_stars_idx` ON `players` (`net_stars`,`id`);--> statement-breakpoint
CREATE INDEX `players_updated_idx` ON `players` (`updated_at`);