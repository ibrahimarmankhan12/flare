CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dodo_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dodo_payment_id" text NOT NULL,
	"dodo_subscription_id" text,
	"amount" bigint NOT NULL,
	"currency" varchar(8) NOT NULL,
	"status" varchar(32) NOT NULL,
	"tier" varchar NOT NULL,
	"paid_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "dodo_payment_dodo_payment_id_unique" UNIQUE("dodo_payment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dodo_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dodo_subscription_id" text NOT NULL,
	"dodo_customer_id" text,
	"dodo_product_id" text NOT NULL,
	"tier" varchar DEFAULT 'free' NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "dodo_subscription_dodo_subscription_id_unique" UNIQUE("dodo_subscription_id")
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
CREATE TABLE IF NOT EXISTS "security_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" varchar NOT NULL,
	"ip" text NOT NULL,
	"country" text,
	"city" text,
	"device" text NOT NULL,
	"os" text NOT NULL,
	"browser" text NOT NULL,
	"user_agent" text NOT NULL,
	"referer" text,
	"is_new_device" boolean DEFAULT false NOT NULL,
	"is_new_location" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_config_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"settings" json NOT NULL,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"change_type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"settings" json NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "site_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN IF NOT EXISTS "parent_thread_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN IF NOT EXISTS "fork_from_message_id" text;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN IF NOT EXISTS "branch_label" varchar(100);--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN IF NOT EXISTS "scope" varchar(16) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN IF NOT EXISTS "scope_id" uuid;--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN IF NOT EXISTS "source_message_id" text;--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN IF NOT EXISTS "confidence" real;--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN IF NOT EXISTS "is_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "tier" varchar DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "created_ip" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "last_ip" text;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "dodo_payment" ADD CONSTRAINT "dodo_payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "dodo_subscription" ADD CONSTRAINT "dodo_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dodo_payment_user_id_idx" ON "dodo_payment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dodo_payment_subscription_id_idx" ON "dodo_payment" USING btree ("dodo_subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dodo_subscription_user_id_idx" ON "dodo_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dodo_subscription_status_idx" ON "dodo_subscription" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_event_user_id_idx" ON "security_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_event_type_idx" ON "security_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_event_created_at_idx" ON "security_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_config_audit_key_idx" ON "site_config_audit" USING btree ("key");--> statement-breakpoint
ALTER TABLE "chat_thread" ADD CONSTRAINT "chat_thread_parent_thread_id_chat_thread_id_fk" FOREIGN KEY ("parent_thread_id") REFERENCES "public"."chat_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD CONSTRAINT "chat_thread_fork_from_message_id_chat_message_id_fk" FOREIGN KEY ("fork_from_message_id") REFERENCES "public"."chat_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memory" ADD CONSTRAINT "user_memory_source_message_id_chat_message_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."chat_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_memory_user_scope_idx" ON "user_memory" USING btree ("user_id","scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memory_source_message_idx" ON "user_memory" USING btree ("source_message_id");--> statement-breakpoint
-- Phase 1+#7 — index for fork lookups ("show me all branches of this thread").
CREATE INDEX IF NOT EXISTS "chat_thread_parent_thread_id_idx" ON "chat_thread" USING btree ("parent_thread_id");--> statement-breakpoint
-- Phase 1+#1 — HNSW index on the memory embedding column for cosine-distance
-- search. Created in the migration (not via Drizzle's `index()` builder)
-- because HNSW requires the `USING hnsw (...)` syntax.
CREATE INDEX "user_memory_embedding_hnsw_idx" ON "user_memory" USING hnsw ("embedding" vector_cosine_ops);