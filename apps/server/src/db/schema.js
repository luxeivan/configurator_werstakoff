import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

const id = () =>
  bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey();

const createdAt = () =>
  timestamp('created_at', { fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull();
// updated_at is set by services: MySQL 8.4 rejects onUpdateNow() with fsp=3.
const updatedAt = () =>
  timestamp('updated_at', { fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull();

export const users = mysqlTable(
  'users',
  {
    id: id(),
    publicId: char('public_id', { length: 26 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: mysqlEnum('role', ['admin', 'manager', 'customer']).notNull().default('customer'),
    name: varchar('name', { length: 255 }).notNull().default(''),
    phone: varchar('phone', { length: 32 }).notNull().default(''),
    isActive: tinyint('is_active').notNull().default(1),
    lastLoginAt: datetime('last_login_at', { fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    publicId: uniqueIndex('users_public_id_uq').on(table.publicId),
    email: uniqueIndex('users_email_uq').on(table.email),
    role: index('users_role_idx').on(table.role),
  }),
);

export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: json('value').notNull(),
  updatedBy: bigint('updated_by', { mode: 'number', unsigned: true }),
  updatedAt: updatedAt(),
});

export const auditLog = mysqlTable(
  'audit_log',
  {
    id: id(),
    actorUserId: bigint('actor_user_id', { mode: 'number', unsigned: true }),
    action: varchar('action', { length: 64 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }).notNull().default(''),
    meta: json('meta'),
    ip: varchar('ip', { length: 45 }).notNull().default(''),
    userAgent: varchar('user_agent', { length: 500 }).notNull().default(''),
    createdAt: createdAt(),
  },
  (table) => ({
    created: index('audit_created_idx').on(table.createdAt),
    entity: index('audit_entity_idx').on(table.entityType, table.entityId),
  }),
);

export const orderCounters = mysqlTable('order_counters', {
  year: varchar('year', { length: 4 }).primaryKey(),
  lastNumber: bigint('last_number', { mode: 'number', unsigned: true }).notNull().default(0),
  updatedAt: updatedAt(),
});

export const files = mysqlTable(
  'files',
  {
    id: id(),
    publicId: char('public_id', { length: 26 }).notNull(),
    path: varchar('path', { length: 500 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull().default(''),
    mime: varchar('mime', { length: 127 }).notNull().default(''),
    sizeBytes: bigint('size_bytes', { mode: 'number', unsigned: true }).notNull().default(0),
    sha256: char('sha256', { length: 64 }).notNull().default(''),
    kind: mysqlEnum('kind', [
      'product_image',
      'model',
      'order_image',
      'pdf',
      'logo',
      'other',
    ]).notNull().default('other'),
    isPublic: tinyint('is_public').notNull().default(0),
    createdBy: bigint('created_by', { mode: 'number', unsigned: true }).references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => ({
    publicId: uniqueIndex('files_public_id_uq').on(table.publicId),
    path: uniqueIndex('files_path_uq').on(table.path),
    sha: index('files_sha_idx').on(table.sha256),
  }),
);

export const sections = mysqlTable(
  'sections',
  {
    id: id(),
    publicId: char('public_id', { length: 26 }).notNull(),
    parentId: bigint('parent_id', { mode: 'number', unsigned: true }),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    description: varchar('description', { length: 2000 }).notNull().default(''),
    imageFileId: bigint('image_file_id', { mode: 'number', unsigned: true }).references(
      () => files.id,
      { onDelete: 'set null' },
    ),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
    isActive: tinyint('is_active').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    publicId: uniqueIndex('sections_public_id_uq').on(table.publicId),
    slug: uniqueIndex('sections_slug_uq').on(table.slug),
    parent: index('sections_parent_idx').on(table.parentId, table.sort),
  }),
);

export const products = mysqlTable(
  'products',
  {
    id: id(),
    publicId: char('public_id', { length: 26 }).notNull(),
    sectionId: bigint('section_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => sections.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    sku: varchar('sku', { length: 64 }),
    priceKopecks: bigint('price_kopecks', { mode: 'number', unsigned: true }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('RUB'),
    unit: varchar('unit', { length: 16 }).notNull().default('шт'),
    widthCm: decimal('width_cm', { precision: 7, scale: 1 }).notNull(),
    depthCm: decimal('depth_cm', { precision: 7, scale: 1 }).notNull(),
    heightCm: decimal('height_cm', { precision: 7, scale: 1 }).notNull(),
    weightKg: decimal('weight_kg', { precision: 8, scale: 3 }),
    shortDescription: varchar('short_description', { length: 500 }).notNull().default(''),
    description: text('description'),
    modelFileId: bigint('model_file_id', { mode: 'number', unsigned: true }).references(
      () => files.id,
      { onDelete: 'set null' },
    ),
    modelOriginalFileId: bigint('model_original_file_id', {
      mode: 'number',
      unsigned: true,
    }).references(() => files.id, { onDelete: 'set null' }),
    modelFormat: varchar('model_format', { length: 16 }),
    modelBboxMm: json('model_bbox_mm'),
    modelTriangles: bigint('model_triangles', { mode: 'number', unsigned: true }),
    modelTransform: json('model_transform'),
    modelOptimizedFileId: bigint('model_optimized_file_id', {
      mode: 'number',
      unsigned: true,
    }).references(() => files.id, { onDelete: 'set null' }),
    optimizeStatus: varchar('optimize_status', { length: 16 }).notNull().default('idle'),
    optimizeError: text('optimize_error'),
    optimizeTargetTriangles: bigint('optimize_target_triangles', {
      mode: 'number',
      unsigned: true,
    }),
    optimizeSourceTriangles: bigint('optimize_source_triangles', {
      mode: 'number',
      unsigned: true,
    }),
    optimizeResultTriangles: bigint('optimize_result_triangles', {
      mode: 'number',
      unsigned: true,
    }),
    previewFileId: bigint('preview_file_id', { mode: 'number', unsigned: true }).references(
      () => files.id,
      { onDelete: 'set null' },
    ),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
    isActive: tinyint('is_active').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    publicId: uniqueIndex('products_public_id_uq').on(table.publicId),
    slug: uniqueIndex('products_slug_uq').on(table.slug),
    sku: uniqueIndex('products_sku_uq').on(table.sku),
    section: index('products_section_idx').on(table.sectionId, table.isActive, table.sort),
    price: index('products_price_idx').on(table.priceKopecks),
    name: index('products_name_idx').on(table.name),
  }),
);

export const productImages = mysqlTable(
  'product_images',
  {
    id: id(),
    productId: bigint('product_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    fileId: bigint('file_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
    alt: varchar('alt', { length: 255 }).notNull().default(''),
    isMain: tinyint('is_main').notNull().default(0),
  },
  (table) => ({
    uniq: uniqueIndex('product_images_uq').on(table.productId, table.fileId),
    sort: index('product_images_sort_idx').on(table.productId, table.sort),
  }),
);

export const properties = mysqlTable(
  'properties',
  {
    id: id(),
    publicId: char('public_id', { length: 26 }).notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    nameNormalized: varchar('name_normalized', { length: 120 }).notNull(),
    type: mysqlEnum('type', ['string', 'text', 'number', 'boolean', 'enum', 'color']).notNull(),
    unit: varchar('unit', { length: 16 }),
    isMultiple: tinyint('is_multiple').notNull().default(0),
    isRequiredDefault: tinyint('is_required_default').notNull().default(0),
    isFilterable: tinyint('is_filterable').notNull().default(0),
    showInCard: tinyint('show_in_card').notNull().default(1),
    showInPdf: tinyint('show_in_pdf').notNull().default(1),
    hint: varchar('hint', { length: 500 }).notNull().default(''),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
    isActive: tinyint('is_active').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    publicId: uniqueIndex('properties_public_id_uq').on(table.publicId),
    code: uniqueIndex('properties_code_uq').on(table.code),
    nameNormalized: uniqueIndex('properties_name_normalized_uq').on(table.nameNormalized),
  }),
);

export const propertyParams = mysqlTable(
  'property_params',
  {
    id: id(),
    publicId: char('public_id', { length: 26 }).notNull(),
    propertyId: bigint('property_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    labelNormalized: varchar('label_normalized', { length: 120 }).notNull(),
    hex: char('hex', { length: 7 }),
    ral: varchar('ral', { length: 16 }),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
    isActive: tinyint('is_active').notNull().default(1),
    defaultPriceDeltaKopecks: bigint('default_price_delta_kopecks', {
      mode: 'number',
    })
      .notNull()
      .default(0),
  },
  (table) => ({
    publicId: uniqueIndex('property_params_public_id_uq').on(table.publicId),
    code: uniqueIndex('property_params_code_uq').on(table.propertyId, table.code),
    label: uniqueIndex('property_params_label_uq').on(table.propertyId, table.labelNormalized),
  }),
);

export const productPropertyValues = mysqlTable(
  'product_property_values',
  {
    id: id(),
    productId: bigint('product_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    propertyId: bigint('property_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    paramId: bigint('param_id', { mode: 'number', unsigned: true }).references(
      () => propertyParams.id,
      { onDelete: 'restrict' },
    ),
    valueKey: varchar('value_key', { length: 64 }).notNull().default(''),
    valueText: text('value_text'),
    valueNumber: decimal('value_number', { precision: 14, scale: 3 }),
    valueBool: tinyint('value_bool'),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
  },
  (table) => ({
    uniq: uniqueIndex('product_property_values_uq').on(
      table.productId,
      table.propertyId,
      table.valueKey,
    ),
    filter: index('product_property_values_filter_idx').on(table.propertyId, table.paramId),
  }),
);

export const productOptions = mysqlTable(
  'product_options',
  {
    id: id(),
    productId: bigint('product_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    propertyId: bigint('property_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    isRequired: tinyint('is_required').notNull().default(0),
    isMultiple: tinyint('is_multiple').notNull().default(0),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
  },
  (table) => ({
    uniq: uniqueIndex('product_options_uq').on(table.productId, table.propertyId),
  }),
);

export const productOptionValues = mysqlTable(
  'product_option_values',
  {
    id: id(),
    optionId: bigint('option_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => productOptions.id, { onDelete: 'cascade' }),
    paramId: bigint('param_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => propertyParams.id, { onDelete: 'restrict' }),
    priceDeltaKopecks: bigint('price_delta_kopecks', { mode: 'number' }).notNull().default(0),
    isDefault: tinyint('is_default').notNull().default(0),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
  },
  (table) => ({
    uniq: uniqueIndex('product_option_values_uq').on(table.optionId, table.paramId),
  }),
);

export const orders = mysqlTable(
  'orders',
  {
    id: id(),
    publicId: char('public_id', { length: 26 }).notNull(),
    number: varchar('number', { length: 32 }).notNull(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, {
      onDelete: 'set null',
    }),
    customerSessionHash: char('customer_session_hash', { length: 64 }),
    status: mysqlEnum('status', ['draft', 'saved', 'submitted', 'in_progress', 'done', 'cancelled'])
      .notNull()
      .default('draft'),
    customerName: varchar('customer_name', { length: 255 }).notNull().default(''),
    customerPhone: varchar('customer_phone', { length: 32 }).notNull().default(''),
    customerEmail: varchar('customer_email', { length: 255 }).notNull().default(''),
    company: varchar('company', { length: 255 }).notNull().default(''),
    inn: varchar('inn', { length: 32 }).notNull().default(''),
    comment: text('comment').notNull().default(''),
    consentAt: datetime('consent_at', { fsp: 3 }),
    roomJson: json('room_json').notNull(),
    totalsJson: json('totals_json').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('RUB'),
    vatMode: mysqlEnum('vat_mode', ['none', 'included', 'added']).notNull().default('included'),
    vatRate: decimal('vat_rate', { precision: 5, scale: 2 }).notNull().default('20.00'),
    subtotalKopecks: bigint('subtotal_kopecks', { mode: 'number', unsigned: true }).notNull().default(0),
    vatKopecks: bigint('vat_kopecks', { mode: 'number', unsigned: true }).notNull().default(0),
    totalKopecks: bigint('total_kopecks', { mode: 'number', unsigned: true }).notNull().default(0),
    pdfFileId: bigint('pdf_file_id', { mode: 'number', unsigned: true }).references(() => files.id, {
      onDelete: 'set null',
    }),
    accessTokenHash: char('access_token_hash', { length: 64 }),
    version: int('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    submittedAt: datetime('submitted_at', { fsp: 3 }),
    deletedAt: datetime('deleted_at', { fsp: 3 }),
  },
  (table) => ({
    publicId: uniqueIndex('orders_public_id_uq').on(table.publicId),
    number: uniqueIndex('orders_number_uq').on(table.number),
    statusCreated: index('orders_status_created_idx').on(table.status, table.createdAt),
    email: index('orders_email_idx').on(table.customerEmail),
    phone: index('orders_phone_idx').on(table.customerPhone),
    user: index('orders_user_idx').on(table.userId),
    deleted: index('orders_deleted_idx').on(table.deletedAt),
  }),
);

export const orderItems = mysqlTable(
  'order_items',
  {
    id: id(),
    orderId: bigint('order_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: bigint('product_id', { mode: 'number', unsigned: true }).references(() => products.id, {
      onDelete: 'set null',
    }),
    productSnapshot: json('product_snapshot').notNull(),
    placement: json('placement').notNull(),
    quantity: int('quantity').notNull().default(1),
    unitPriceKopecks: bigint('unit_price_kopecks', { mode: 'number', unsigned: true }).notNull(),
    totalKopecks: bigint('total_kopecks', { mode: 'number', unsigned: true }).notNull(),
    sort: int('sort').notNull().default(0),
  },
  (table) => ({
    order: index('order_items_order_idx').on(table.orderId, table.sort),
  }),
);

export const orderImages = mysqlTable(
  'order_images',
  {
    id: id(),
    orderId: bigint('order_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    kind: mysqlEnum('kind', ['plan2d', 'view3d_user', 'view3d_fit', 'front', 'profile', 'thumb']).notNull(),
    fileId: bigint('file_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    width: int('width'),
    height: int('height'),
    cameraJson: json('camera_json'),
    sort: int('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => ({
    uniq: uniqueIndex('order_images_order_kind_uq').on(table.orderId, table.kind),
  }),
);

export const orderStatusHistory = mysqlTable(
  'order_status_history',
  {
    id: id(),
    orderId: bigint('order_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: varchar('from_status', { length: 32 }),
    toStatus: varchar('to_status', { length: 32 }).notNull(),
    comment: text('comment').notNull().default(''),
    actorUserId: bigint('actor_user_id', { mode: 'number', unsigned: true }).references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => ({
    order: index('order_status_history_order_idx').on(table.orderId, table.createdAt),
  }),
);

export const schema = {
  users,
  settings,
  auditLog,
  orderCounters,
  files,
  sections,
  products,
  productImages,
  properties,
  propertyParams,
  productPropertyValues,
  productOptions,
  productOptionValues,
  orders,
  orderItems,
  orderImages,
  orderStatusHistory,
};
