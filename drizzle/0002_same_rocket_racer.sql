ALTER TABLE `players` DROP INDEX `players_display_name_uq`;--> statement-breakpoint
DROP INDEX `players_stars_idx` ON `players`;--> statement-breakpoint
CREATE INDEX `players_stars_idx` ON `players` (`net_stars`,`public_id`);--> statement-breakpoint
ALTER TABLE `players` DROP COLUMN `discriminator`;