CREATE TABLE IF NOT EXISTS "user_connector" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar NOT NULL,
	"email" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"scope" text,
	"is_connected" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "user_connector_user_id_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_connector_user_id_idx" ON "user_connector" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_connector_provider_idx" ON "user_connector" USING btree ("provider");
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "user_connector" ADD CONSTRAINT "user_connector_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
