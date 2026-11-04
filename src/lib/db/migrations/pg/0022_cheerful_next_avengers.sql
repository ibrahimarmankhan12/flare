-- pgvector is required for the `vector(1536)` columns on `user_memory`
-- (added in 0021) and `document_chunk` (added here). 0021 enabled it
-- on the live DB; we re-state the extension here so the migration is
-- self-contained when replayed against a fresh database.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "bug_report_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bug_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" varchar DEFAULT 'medium' NOT NULL,
	"category" varchar(64) DEFAULT 'other' NOT NULL,
	"affected_area" text,
	"reproduction_steps" text DEFAULT '' NOT NULL,
	"impact" text DEFAULT '' NOT NULL,
	"proof_of_concept" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"awarded_amount_cents" integer,
	"awarded_currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"awarded_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"source_type" varchar NOT NULL,
	"source_url" text,
	"filename" text,
	"media_type" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"content" text NOT NULL,
	"position" integer NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_item_id" uuid NOT NULL,
	"content" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN "decisions" jsonb;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN "action_items" jsonb;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN "insights_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "bug_report_comment" ADD CONSTRAINT "bug_report_comment_report_id_bug_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."bug_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_comment" ADD CONSTRAINT "bug_report_comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report" ADD CONSTRAINT "bug_report_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_collection_item_id_collection_item_id_fk" FOREIGN KEY ("collection_item_id") REFERENCES "public"."collection_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bug_report_comment_report_id_idx" ON "bug_report_comment" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "bug_report_comment_user_id_idx" ON "bug_report_comment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bug_report_user_id_idx" ON "bug_report" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bug_report_status_idx" ON "bug_report" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bug_report_created_at_idx" ON "bug_report" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bug_report_severity_idx" ON "bug_report" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "collection_item_collection_id_idx" ON "collection_item" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_item_status_idx" ON "collection_item" USING btree ("status");--> statement-breakpoint
CREATE INDEX "collection_user_id_idx" ON "collection" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_chunk_document_id_idx" ON "document_chunk" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_collection_item_id_idx" ON "document" USING btree ("collection_item_id");--> statement-breakpoint
-- P2.1 — HNSW index on the document_chunk embedding column for
-- cosine-distance search. Created in the migration (not via Drizzle's
-- `index()` builder) because HNSW requires the `USING hnsw (...)` syntax,
-- which is not supported by `index()`.
CREATE INDEX "document_chunk_embedding_hnsw_idx" ON "document_chunk" USING hnsw ("embedding" vector_cosine_ops);