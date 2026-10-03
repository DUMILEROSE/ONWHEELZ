CREATE TABLE `offer_impressions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`offerId` int NOT NULL,
	`eventKey` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `offer_impressions_id` PRIMARY KEY(`id`),
	CONSTRAINT `offer_impressions_event_uidx` UNIQUE(`eventKey`)
);
--> statement-breakpoint
DROP INDEX `affiliate_clicks_application_idx` ON `affiliate_clicks`;--> statement-breakpoint
ALTER TABLE `offer_impressions` ADD CONSTRAINT `offer_impressions_offerId_offers_id_fk` FOREIGN KEY (`offerId`) REFERENCES `offers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `offer_impressions_offer_time_idx` ON `offer_impressions` (`offerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `affiliate_conversions_seller_created_idx` ON `affiliate_conversions` (`sellerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `affiliate_conversions_application_created_idx` ON `affiliate_conversions` (`applicationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `affiliate_clicks_application_idx` ON `affiliate_clicks` (`applicationId`,`createdAt`);