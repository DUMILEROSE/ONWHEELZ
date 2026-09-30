CREATE TABLE `paypal_payout_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdByUserId` int NOT NULL,
	`senderBatchId` varchar(30) NOT NULL,
	`paypalBatchId` varchar(80),
	`environment` enum('sandbox','live') NOT NULL,
	`status` enum('draft','submitting','submitted','processing','succeeded','partially_succeeded','failed','unknown','cancelled') NOT NULL DEFAULT 'draft',
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`totalAmount` decimal(12,2) NOT NULL,
	`itemCount` int NOT NULL,
	`statusCheckedAt` timestamp,
	`failureCode` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paypal_payout_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `paypal_payout_batches_senderBatchId_unique` UNIQUE(`senderBatchId`),
	CONSTRAINT `paypal_payout_batches_paypalBatchId_unique` UNIQUE(`paypalBatchId`)
);
--> statement-breakpoint
CREATE TABLE `paypal_payout_conversions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payoutItemId` int NOT NULL,
	`conversionId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paypal_payout_conversions_id` PRIMARY KEY(`id`),
	CONSTRAINT `paypal_payout_conversions_item_conversion_uidx` UNIQUE(`payoutItemId`,`conversionId`)
);
--> statement-breakpoint
CREATE TABLE `paypal_payout_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`affiliateProfileId` int NOT NULL,
	`senderItemId` varchar(30) NOT NULL,
	`paypalItemId` varchar(80),
	`recipientCiphertext` text NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`status` enum('draft','pending','succeeded','failed','blocked','returned','unclaimed','unknown') NOT NULL DEFAULT 'draft',
	`failureCode` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paypal_payout_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `paypal_payout_items_paypalItemId_unique` UNIQUE(`paypalItemId`),
	CONSTRAINT `paypal_payout_items_batch_sender_uidx` UNIQUE(`batchId`,`senderItemId`)
);
--> statement-breakpoint
CREATE TABLE `paypal_webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(80) NOT NULL,
	`eventType` varchar(120) NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paypal_webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `paypal_webhook_events_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
ALTER TABLE `affiliate_conversions` MODIFY COLUMN `status` enum('pending','approved','rejected','batched','paid') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `affiliate_profiles` ADD `paypalRecipientCiphertext` text;--> statement-breakpoint
ALTER TABLE `paypal_payout_batches` ADD CONSTRAINT `paypal_payout_batches_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paypal_payout_conversions` ADD CONSTRAINT `paypal_payout_conversions_payoutItemId_paypal_payout_items_id_fk` FOREIGN KEY (`payoutItemId`) REFERENCES `paypal_payout_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paypal_payout_conversions` ADD CONSTRAINT `ppc_conversion_fk` FOREIGN KEY (`conversionId`) REFERENCES `affiliate_conversions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paypal_payout_items` ADD CONSTRAINT `paypal_payout_items_batchId_paypal_payout_batches_id_fk` FOREIGN KEY (`batchId`) REFERENCES `paypal_payout_batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paypal_payout_items` ADD CONSTRAINT `paypal_payout_items_affiliateProfileId_affiliate_profiles_id_fk` FOREIGN KEY (`affiliateProfileId`) REFERENCES `affiliate_profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `paypal_payout_batches_status_created_idx` ON `paypal_payout_batches` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `paypal_payout_conversions_conversion_idx` ON `paypal_payout_conversions` (`conversionId`);--> statement-breakpoint
CREATE INDEX `paypal_payout_items_affiliate_status_idx` ON `paypal_payout_items` (`affiliateProfileId`,`status`);
