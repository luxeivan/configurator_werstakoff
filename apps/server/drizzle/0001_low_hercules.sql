CREATE TABLE `files` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`public_id` char(26) NOT NULL,
	`path` varchar(500) NOT NULL,
	`original_name` varchar(255) NOT NULL DEFAULT '',
	`mime` varchar(127) NOT NULL DEFAULT '',
	`size_bytes` bigint unsigned NOT NULL DEFAULT 0,
	`sha256` char(64) NOT NULL DEFAULT '',
	`kind` enum('product_image','model','order_image','pdf','logo','other') NOT NULL DEFAULT 'other',
	`is_public` tinyint NOT NULL DEFAULT 0,
	`created_by` bigint unsigned,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `files_id` PRIMARY KEY(`id`),
	CONSTRAINT `files_public_id_uq` UNIQUE(`public_id`),
	CONSTRAINT `files_path_uq` UNIQUE(`path`)
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`product_id` bigint unsigned NOT NULL,
	`file_id` bigint unsigned NOT NULL,
	`sort` bigint NOT NULL DEFAULT 0,
	`alt` varchar(255) NOT NULL DEFAULT '',
	`is_main` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `product_images_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_images_uq` UNIQUE(`product_id`,`file_id`)
);
--> statement-breakpoint
CREATE TABLE `product_option_values` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`option_id` bigint unsigned NOT NULL,
	`param_id` bigint unsigned NOT NULL,
	`price_delta_kopecks` bigint NOT NULL DEFAULT 0,
	`is_default` tinyint NOT NULL DEFAULT 0,
	`sort` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `product_option_values_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_option_values_uq` UNIQUE(`option_id`,`param_id`)
);
--> statement-breakpoint
CREATE TABLE `product_options` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`product_id` bigint unsigned NOT NULL,
	`property_id` bigint unsigned NOT NULL,
	`is_required` tinyint NOT NULL DEFAULT 0,
	`is_multiple` tinyint NOT NULL DEFAULT 0,
	`sort` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `product_options_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_options_uq` UNIQUE(`product_id`,`property_id`)
);
--> statement-breakpoint
CREATE TABLE `product_property_values` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`product_id` bigint unsigned NOT NULL,
	`property_id` bigint unsigned NOT NULL,
	`param_id` bigint unsigned,
	`value_key` varchar(64) NOT NULL DEFAULT '',
	`value_text` text,
	`value_number` decimal(14,3),
	`value_bool` tinyint,
	`sort` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `product_property_values_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_property_values_uq` UNIQUE(`product_id`,`property_id`,`value_key`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`public_id` char(26) NOT NULL,
	`section_id` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`sku` varchar(64),
	`price_kopecks` bigint unsigned NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'RUB',
	`unit` varchar(16) NOT NULL DEFAULT 'шт',
	`width_cm` decimal(7,1) NOT NULL,
	`depth_cm` decimal(7,1) NOT NULL,
	`height_cm` decimal(7,1) NOT NULL,
	`weight_kg` decimal(8,3),
	`short_description` varchar(500) NOT NULL DEFAULT '',
	`description` text,
	`model_file_id` bigint unsigned,
	`model_original_file_id` bigint unsigned,
	`model_format` varchar(16),
	`model_bbox_mm` json,
	`model_triangles` bigint unsigned,
	`model_transform` json,
	`preview_file_id` bigint unsigned,
	`sort` bigint NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_public_id_uq` UNIQUE(`public_id`),
	CONSTRAINT `products_slug_uq` UNIQUE(`slug`),
	CONSTRAINT `products_sku_uq` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`public_id` char(26) NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`name_normalized` varchar(120) NOT NULL,
	`type` enum('string','text','number','boolean','enum','color') NOT NULL,
	`unit` varchar(16),
	`is_multiple` tinyint NOT NULL DEFAULT 0,
	`is_required_default` tinyint NOT NULL DEFAULT 0,
	`is_filterable` tinyint NOT NULL DEFAULT 0,
	`show_in_card` tinyint NOT NULL DEFAULT 1,
	`show_in_pdf` tinyint NOT NULL DEFAULT 1,
	`hint` varchar(500) NOT NULL DEFAULT '',
	`sort` bigint NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `properties_id` PRIMARY KEY(`id`),
	CONSTRAINT `properties_public_id_uq` UNIQUE(`public_id`),
	CONSTRAINT `properties_code_uq` UNIQUE(`code`),
	CONSTRAINT `properties_name_normalized_uq` UNIQUE(`name_normalized`)
);
--> statement-breakpoint
CREATE TABLE `property_params` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`public_id` char(26) NOT NULL,
	`property_id` bigint unsigned NOT NULL,
	`code` varchar(64) NOT NULL,
	`label` varchar(120) NOT NULL,
	`label_normalized` varchar(120) NOT NULL,
	`hex` char(7),
	`ral` varchar(16),
	`sort` bigint NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`default_price_delta_kopecks` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `property_params_id` PRIMARY KEY(`id`),
	CONSTRAINT `property_params_public_id_uq` UNIQUE(`public_id`),
	CONSTRAINT `property_params_code_uq` UNIQUE(`property_id`,`code`),
	CONSTRAINT `property_params_label_uq` UNIQUE(`property_id`,`label_normalized`)
);
--> statement-breakpoint
CREATE TABLE `sections` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`public_id` char(26) NOT NULL,
	`parent_id` bigint unsigned,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`description` varchar(2000) NOT NULL DEFAULT '',
	`image_file_id` bigint unsigned,
	`sort` bigint NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `sections_id` PRIMARY KEY(`id`),
	CONSTRAINT `sections_public_id_uq` UNIQUE(`public_id`),
	CONSTRAINT `sections_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `files` ADD CONSTRAINT `files_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_option_values` ADD CONSTRAINT `product_option_values_option_id_product_options_id_fk` FOREIGN KEY (`option_id`) REFERENCES `product_options`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_option_values` ADD CONSTRAINT `product_option_values_param_id_property_params_id_fk` FOREIGN KEY (`param_id`) REFERENCES `property_params`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_options` ADD CONSTRAINT `product_options_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_options` ADD CONSTRAINT `product_options_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_property_values` ADD CONSTRAINT `product_property_values_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_property_values` ADD CONSTRAINT `product_property_values_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_property_values` ADD CONSTRAINT `product_property_values_param_id_property_params_id_fk` FOREIGN KEY (`param_id`) REFERENCES `property_params`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_section_id_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_model_file_id_files_id_fk` FOREIGN KEY (`model_file_id`) REFERENCES `files`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_model_original_file_id_files_id_fk` FOREIGN KEY (`model_original_file_id`) REFERENCES `files`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_preview_file_id_files_id_fk` FOREIGN KEY (`preview_file_id`) REFERENCES `files`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_params` ADD CONSTRAINT `property_params_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sections` ADD CONSTRAINT `sections_image_file_id_files_id_fk` FOREIGN KEY (`image_file_id`) REFERENCES `files`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `files_sha_idx` ON `files` (`sha256`);--> statement-breakpoint
CREATE INDEX `product_images_sort_idx` ON `product_images` (`product_id`,`sort`);--> statement-breakpoint
CREATE INDEX `product_property_values_filter_idx` ON `product_property_values` (`property_id`,`param_id`);--> statement-breakpoint
CREATE INDEX `products_section_idx` ON `products` (`section_id`,`is_active`,`sort`);--> statement-breakpoint
CREATE INDEX `products_price_idx` ON `products` (`price_kopecks`);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `sections_parent_idx` ON `sections` (`parent_id`,`sort`);