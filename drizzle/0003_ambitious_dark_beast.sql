CREATE TABLE `seller_webhook_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`secretHash` varchar(64) NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`lastReceivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`rotatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seller_webhook_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `seller_webhook_keys_seller_uidx` UNIQUE(`sellerId`)
);
--> statement-breakpoint
ALTER TABLE `affiliate_conversions` ADD `sourceType` enum('manual','webhook') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliate_conversions` ADD `sourceEventId` varchar(120);--> statement-breakpoint
ALTER TABLE `offers` ADD `region` varchar(80) DEFAULT 'Global' NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliate_conversions` ADD CONSTRAINT `affiliate_conversions_seller_event_uidx` UNIQUE(`sellerId`,`sourceEventId`);--> statement-breakpoint
ALTER TABLE `seller_webhook_keys` ADD CONSTRAINT `seller_webhook_keys_sellerId_seller_organizations_id_fk` FOREIGN KEY (`sellerId`) REFERENCES `seller_organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `seller_webhook_keys_status_idx` ON `seller_webhook_keys` (`status`);