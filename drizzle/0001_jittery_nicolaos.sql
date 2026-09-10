CREATE TABLE `idProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`handle` varchar(64) NOT NULL,
	`identifier` varchar(320) NOT NULL,
	`passwordHash` text NOT NULL,
	`profileJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `idProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `idProfiles_handle_unique` UNIQUE(`handle`),
	CONSTRAINT `idProfiles_identifier_unique` UNIQUE(`identifier`)
);
