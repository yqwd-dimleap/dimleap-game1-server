ALTER TABLE `auth_identities` DROP FOREIGN KEY `auth_identities_player_id_players_id_fk`;--> statement-breakpoint
ALTER TABLE `battle_results` DROP FOREIGN KEY `battle_results_player_id_players_id_fk`;--> statement-breakpoint
ALTER TABLE `hero_progress` DROP FOREIGN KEY `hero_progress_player_id_players_id_fk`;--> statement-breakpoint
ALTER TABLE `player_public_ids` DROP FOREIGN KEY `player_public_ids_assigned_player_id_players_id_fk`;--> statement-breakpoint
ALTER TABLE `reward_claims` DROP FOREIGN KEY `reward_claims_player_id_players_id_fk`;--> statement-breakpoint
ALTER TABLE `players` MODIFY COLUMN `id` bigint NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_identities` MODIFY COLUMN `player_id` bigint NOT NULL;--> statement-breakpoint
ALTER TABLE `battle_results` MODIFY COLUMN `player_id` bigint NOT NULL;--> statement-breakpoint
ALTER TABLE `hero_progress` MODIFY COLUMN `player_id` bigint NOT NULL;--> statement-breakpoint
ALTER TABLE `player_public_ids` MODIFY COLUMN `assigned_player_id` bigint;--> statement-breakpoint
ALTER TABLE `reward_claims` MODIFY COLUMN `player_id` bigint NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_identities` ADD CONSTRAINT `auth_identities_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `battle_results` ADD CONSTRAINT `battle_results_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hero_progress` ADD CONSTRAINT `hero_progress_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_public_ids` ADD CONSTRAINT `player_public_ids_assigned_player_id_players_id_fk` FOREIGN KEY (`assigned_player_id`) REFERENCES `players`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reward_claims` ADD CONSTRAINT `reward_claims_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;
