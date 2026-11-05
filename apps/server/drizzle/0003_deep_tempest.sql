ALTER TABLE `products` ADD `model_optimized_file_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `products` ADD `optimize_status` varchar(16) DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `optimize_error` text;--> statement-breakpoint
ALTER TABLE `products` ADD `optimize_target_triangles` bigint unsigned;--> statement-breakpoint
ALTER TABLE `products` ADD `optimize_source_triangles` bigint unsigned;--> statement-breakpoint
ALTER TABLE `products` ADD `optimize_result_triangles` bigint unsigned;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_model_optimized_file_id_files_id_fk` FOREIGN KEY (`model_optimized_file_id`) REFERENCES `files`(`id`) ON DELETE set null ON UPDATE no action;