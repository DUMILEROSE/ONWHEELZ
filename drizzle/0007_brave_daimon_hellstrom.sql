CREATE TABLE `seller_budget_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`periodStart` timestamp NOT NULL,
	`plannedAmount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seller_budget_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `seller_budget_plans_seller_period_uidx` UNIQUE(`sellerId`,`periodStart`)
);
--> statement-breakpoint
CREATE TABLE `seller_budget_revisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`planId` int NOT NULL,
	`priorAmount` decimal(12,2),
	`newAmount` decimal(12,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seller_budget_revisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `seller_budget_plans` ADD CONSTRAINT `seller_budget_plans_sellerId_seller_organizations_id_fk` FOREIGN KEY (`sellerId`) REFERENCES `seller_organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_budget_revisions` ADD CONSTRAINT `seller_budget_revisions_planId_seller_budget_plans_id_fk` FOREIGN KEY (`planId`) REFERENCES `seller_budget_plans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `seller_budget_revisions_plan_created_idx` ON `seller_budget_revisions` (`planId`,`createdAt`);