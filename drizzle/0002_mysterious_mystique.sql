CREATE TABLE `affiliate_clicks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `affiliate_clicks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `affiliate_conversions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` int NOT NULL,
	`sellerId` int NOT NULL,
	`orderReference` varchar(120) NOT NULL,
	`saleAmount` decimal(12,2) NOT NULL,
	`commissionAmount` decimal(12,2) NOT NULL,
	`status` enum('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
	`sellerNote` text,
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_conversions_id` PRIMARY KEY(`id`),
	CONSTRAINT `affiliate_conversions_seller_order_uidx` UNIQUE(`sellerId`,`orderReference`)
);
--> statement-breakpoint
ALTER TABLE `affiliate_applications` ADD `trackingCode` varchar(32);--> statement-breakpoint
ALTER TABLE `affiliate_profiles` ADD `verificationStatus` enum('pending','more_details','verified','rejected') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliate_profiles` ADD `verificationNote` text;--> statement-breakpoint
ALTER TABLE `seller_organizations` ADD `verificationStatus` enum('pending','more_details','verified','rejected') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_organizations` ADD `verificationNote` text;--> statement-breakpoint
ALTER TABLE `affiliate_applications` ADD CONSTRAINT `affiliate_applications_tracking_code_uidx` UNIQUE(`trackingCode`);--> statement-breakpoint
ALTER TABLE `affiliate_clicks` ADD CONSTRAINT `affiliate_clicks_applicationId_affiliate_applications_id_fk` FOREIGN KEY (`applicationId`) REFERENCES `affiliate_applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `affiliate_conversions` ADD CONSTRAINT `affiliate_conversions_applicationId_affiliate_applications_id_fk` FOREIGN KEY (`applicationId`) REFERENCES `affiliate_applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `affiliate_conversions` ADD CONSTRAINT `affiliate_conversions_sellerId_seller_organizations_id_fk` FOREIGN KEY (`sellerId`) REFERENCES `seller_organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `affiliate_clicks_application_idx` ON `affiliate_clicks` (`applicationId`);--> statement-breakpoint
CREATE INDEX `affiliate_conversions_application_status_idx` ON `affiliate_conversions` (`applicationId`,`status`);