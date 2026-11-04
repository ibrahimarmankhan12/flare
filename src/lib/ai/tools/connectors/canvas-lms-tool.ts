import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["list_courses", "get_course", "list_assignments", "get_assignment", "list_quizzes"]),
  courseId: z.union([z.string(), z.number()]).optional(),
  assignmentId: z.union([z.string(), z.number()]).optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface CanvasLmsToolInput {
  action: "list_courses" | "get_course" | "list_assignments" | "get_assignment" | "list_quizzes";
  courseId?: string | number;
  assignmentId?: string | number;
  limit?: number;
}

function getBaseUrl(): string {
  return process.env.CANVAS_BASE_URL?.replace(/\/+$/, "") || "";
}

async function getAuthHeader(): Promise<string | null> {
  const token = getTokenProviderToken("canvas");
  return token ? `Bearer ${token}` : null;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "canvas"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createCanvasLmsToolForUser(userId: string): Tool {
  return createTool({
    description: `Canvas LMS integration tool (server-token).

Actions:
- list_courses: List active courses.
- get_course: Read a course (requires: courseId).
- list_assignments: List assignments in a course (requires: courseId).
- get_assignment: Read an assignment (requires: courseId, assignmentId).
- list_quizzes: List quizzes in a course (requires: courseId).

Configured via CANVAS_BASE_URL and CANVAS_API_TOKEN env vars.`,
    inputSchema,
    execute: async (input: CanvasLmsToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const base = getBaseUrl();
        const auth = await getAuthHeader();
        if (!base || !auth) {
          return { error: "Canvas LMS is not configured. Set CANVAS_BASE_URL, CANVAS_API_TOKEN." };
        }
        if (!(await getIsConnected(userId))) {
          return { error: "Canvas LMS is not connected. Click Connect to enable (single-tenant)." };
        }
        const headers = { Authorization: auth };

        if (action === "list_courses") {
          const res = await fetch(
            `${base}/api/v1/courses?per_page=${limit}&enrollment_state=active`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_course") {
          if (!input.courseId) return { error: "courseId required" };
          const res = await fetch(`${base}/api/v1/courses/${input.courseId}`, { headers });
          return await res.json();
        }
        if (action === "list_assignments") {
          if (!input.courseId) return { error: "courseId required" };
          const res = await fetch(
            `${base}/api/v1/courses/${input.courseId}/assignments?per_page=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_assignment") {
          if (!input.courseId || !input.assignmentId) {
            return { error: "courseId and assignmentId required" };
          }
          const res = await fetch(
            `${base}/api/v1/courses/${input.courseId}/assignments/${input.assignmentId}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "list_quizzes") {
          if (!input.courseId) return { error: "courseId required" };
          const res = await fetch(
            `${base}/api/v1/courses/${input.courseId}/quizzes?per_page=${limit}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Canvas tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Canvas operation failed.",
        };
      }
    },
  });
}

export const canvasLmsTool = createTool({
  description: "Canvas LMS tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Canvas tool requires user context." }),
});
