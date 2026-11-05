CREATE TABLE `order_images` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`kind` enum('plan2d','view3d_user','view3d_fit','front','profile','thumb') NOT NULL,
	`file_id` bigint unsigned NOT NULL,
	`width` int,
	`height` int,
	`camera_json` json,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `order_images_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_images_order_kind_uq` UNIQUE(`order_id`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`product_id` bigint unsigned,
	`product_snapshot` json NOT NULL,
	`placement` json NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unit_price_kopecks` bigint unsigned NOT NULL,
	`total_kopecks` bigint unsigned NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`from_status` varchar(32),
	`to_status` varchar(32) NOT NULL,
	`comment` text NOT NULL DEFAULT (''),
	`actor_user_id` bigint unsigned,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `order_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`public_id` char(26) NOT NULL,
	`number` varchar(32) NOT NULL,
	`user_id` bigint unsigned,
	`customer_session_hash` char(64),
	`status` enum('draft','saved','submitted','in_progress','done','cancelled') NOT NULL DEFAULT 'draft',
	`customer_name` varchar(255) NOT NULL DEFAULT '',
	`customer_phone` varchar(32) NOT NULL DEFAULT '',
	`customer_email` varchar(255) NOT NULL DEFAULT '',
	`company` varchar(255) NOT NULL DEFAULT '',
	`inn` varchar(32) NOT NULL DEFAULT '',
	`comment` text NOT NULL DEFAULT (''),
	`consent_at` datetime(3),
	`room_json` json NOT NULL,
	`totals_json` json NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'RUB',
	`vat_mode` enum('none','included','added') NOT NULL DEFAULT 'included',
	`vat_rate` decimal(5,2) NOT NULL DEFAULT '20.00',
	`subtotal_kopecks` bigint unsigned NOT NULL DEFAULT 0,
	`vat_kopecks` bigint unsigned NOT NULL DEFAULT 0,
	`total_kopecks` bigint unsigned NOT NULL DEFAULT 0,
	`pdf_file_id` bigint unsigned,
	`access_token_hash` char(64),
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`submitted_at` datetime(3),
	`deleted_at` datetime(3),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_public_id_uq` UNIQUE(`public_id`),
	CONSTRAINT `orders_number_uq` UNIQUE(`number`)
);
--> statement-breakpoint
ALTER TABLE `order_images` ADD CONSTRAINT `order_images_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_images` ADD CONSTRAINT `order_images_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_status_history` ADD CONSTRAINT `order_status_history_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_status_history` ADD CONSTRAINT `order_status_history_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_pdf_file_id_files_id_fk` FOREIGN KEY (`pdf_file_id`) REFERENCES `files`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`,`sort`);--> statement-breakpoint
CREATE INDEX `order_status_history_order_idx` ON `order_status_history` (`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_email_idx` ON `orders` (`customer_email`);--> statement-breakpoint
CREATE INDEX `orders_phone_idx` ON `orders` (`customer_phone`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `orders_deleted_idx` ON `orders` (`deleted_at`);