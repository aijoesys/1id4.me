CREATE TABLE `aiUsage` (
	`profileId` int NOT NULL,
	`windowStarted` timestamp NOT NULL DEFAULT (now()),
	`requestCount` int NOT NULL DEFAULT 0,
	CONSTRAINT `aiUsage_profileId` PRIMARY KEY(`profileId`)
);
