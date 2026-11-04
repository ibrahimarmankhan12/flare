CREATE TABLE IF NOT EXISTS "dodo_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dodo_subscription_id" text NOT NULL UNIQUE,
	"dodo_customer_id" text,
	"dodo_product_id" text NOT NULL,
	"tier" varchar(64) DEFAULT 'free' NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dodo_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dodo_payment_id" text NOT NULL UNIQUE,
	"dodo_subscription_id" text,
	"amount" bigint NOT NULL,
	"currency" varchar(8) NOT NULL,
	"status" varchar(32) NOT NULL,
	"tier" varchar(64) NOT NULL,
	"paid_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dodo_webhook_event" (
	"webhook_id" text PRIMARY KEY NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload" json NOT NULL,
	"received_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"processed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "dodo_subscription" ADD CONSTRAINT "dodo_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "dodo_payment" ADD CONSTRAINT "dodo_payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dodo_subscription_user_id_idx" ON "dodo_subscription" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dodo_subscription_status_idx" ON "dodo_subscription" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dodo_payment_user_id_idx" ON "dodo_payment" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dodo_payment_subscription_id_idx" ON "dodo_payment" USING btree ("dodo_subscription_id");
