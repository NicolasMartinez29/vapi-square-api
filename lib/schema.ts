import { pgTable, text, timestamp, uuid, jsonb, varchar, index } from 'drizzle-orm/pg-core';

export const businesses = pgTable('businesses', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: text('name').notNull(),
  squareAccessToken: text('square_access_token').notNull(),
  squareEnvironment: varchar('square_environment', { length: 16 }).notNull().default('production'),
  squareLocationId: varchar('square_location_id', { length: 64 }).notNull(),
  squareTeamMemberId: varchar('square_team_member_id', { length: 64 }).notNull(),
  serviceMap: jsonb('service_map').$type<Record<string, string>>().notNull().default({}),
  timezone: varchar('timezone', { length: 64 }).notNull().default('America/Chicago'),
  ownerPasswordHash: text('owner_password_hash').notNull(),
  notifyPhone: varchar('notify_phone', { length: 32 }),
  notifyEmail: text('notify_email'),
  dryRun: text('dry_run').notNull().default('false'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    customerName: text('customer_name').notNull(),
    customerPhone: varchar('customer_phone', { length: 32 }).notNull(),
    serviceName: text('service_name').notNull(),
    serviceVariationId: varchar('service_variation_id', { length: 64 }).notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    squareCustomerId: varchar('square_customer_id', { length: 64 }),
    squareBookingId: varchar('square_booking_id', { length: 64 }),
    squareError: text('square_error'),
    source: varchar('source', { length: 32 }).notNull().default('vapi'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byBusinessAndDate: index('appointments_business_scheduled_idx').on(t.businessId, t.scheduledAt),
    byBusinessAndStatus: index('appointments_business_status_idx').on(t.businessId, t.status),
  })
);

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Business = typeof businesses.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Session = typeof sessions.$inferSelect;
