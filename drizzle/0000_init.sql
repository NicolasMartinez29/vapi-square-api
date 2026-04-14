CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" varchar(32) NOT NULL,
	"service_name" text NOT NULL,
	"service_variation_id" varchar(64) NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"square_customer_id" varchar(64),
	"square_booking_id" varchar(64),
	"square_error" text,
	"source" varchar(32) DEFAULT 'vapi' NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"square_access_token" text NOT NULL,
	"square_environment" varchar(16) DEFAULT 'production' NOT NULL,
	"square_location_id" varchar(64) NOT NULL,
	"square_team_member_id" varchar(64) NOT NULL,
	"service_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Chicago' NOT NULL,
	"owner_password_hash" text NOT NULL,
	"notify_phone" varchar(32),
	"notify_email" text,
	"dry_run" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_business_scheduled_idx" ON "appointments" USING btree ("business_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "appointments_business_status_idx" ON "appointments" USING btree ("business_id","status");