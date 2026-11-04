CREATE TABLE IF NOT EXISTS "build_job" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "thread_id" uuid NOT NULL,
  "assistant_message_id" text,
  "tool_call_id" text,
  "status" varchar(32) DEFAULT 'queued' NOT NULL,
  "prompt" text NOT NULL,
  "framework" varchar(32),
  "title" text,
  "summary" text,
  "files" json DEFAULT '[]'::json,
  "preview_url" text,
  "error" text,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "build_job_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "build_job_thread_id_chat_thread_id_fk"
    FOREIGN KEY ("thread_id") REFERENCES "public"."chat_thread"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "build_job_thread_id_idx"
  ON "build_job" ("thread_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "build_job_user_id_idx"
  ON "build_job" ("user_id");--> statement-breakpoint
