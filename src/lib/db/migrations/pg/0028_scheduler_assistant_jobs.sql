-- Phase scheduler follow-up: allow reminders to run as the default assistant
-- without requiring a custom agent row.

ALTER TABLE "scheduled_job"
ALTER COLUMN "agent_id" DROP NOT NULL;
