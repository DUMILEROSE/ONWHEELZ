CREATE TABLE `affiliate_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`offerId` int NOT NULL,
	`affiliateUserId` int NOT NULL,
	`message` text NOT NULL,
	`status` enum('pending','more_details','approved','declined') NOT NULL DEFAULT 'pending',
	`sellerNote` text,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_applications_id` PRIMARY KEY(`id`),
	CONSTRAINT `affiliate_applications_offer_user_uidx` UNIQUE(`offerId`,`affiliateUserId`)
);
--> statement-breakpoint
CREATE TABLE `affiliate_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`channels` varchar(500) NOT NULL,
	`audienceSize` int NOT NULL DEFAULT 0,
	`bio` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `affiliate_profiles_user_uidx` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`category` varchar(64) NOT NULL,
	`description` text NOT NULL,
	`price` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`commissionPercent` decimal(5,2) NOT NULL,
	`destinationUrl` varchar(1000),
	`imageUrl` varchar(1000),
	`status` enum('active','paused','draft') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seller_organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`businessName` varchar(180) NOT NULL,
	`website` varchar(500),
	`contactEmail` varchar(320),
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seller_organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `seller_organizations_owner_uidx` UNIQUE(`ownerId`)
);
--> statement-breakpoint
ALTER TABLE `affiliate_applications` ADD CONSTRAINT `affiliate_applications_offerId_offers_id_fk` FOREIGN KEY (`offerId`) REFERENCES `offers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `affiliate_applications` ADD CONSTRAINT `affiliate_applications_affiliateUserId_users_id_fk` FOREIGN KEY (`affiliateUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `affiliate_profiles` ADD CONSTRAINT `affiliate_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `offers` ADD CONSTRAINT `offers_sellerId_seller_organizations_id_fk` FOREIGN KEY (`sellerId`) REFERENCES `seller_organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_organizations` ADD CONSTRAINT `seller_organizations_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `affiliate_applications_user_status_idx` ON `affiliate_applications` (`affiliateUserId`,`status`);--> statement-breakpoint
CREATE INDEX `offers_status_category_idx` ON `offers` (`status`,`category`);