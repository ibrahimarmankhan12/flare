import { tool as createTool, jsonSchema } from "ai";
import { memoryRepository } from "lib/db/repository";

export const MemoryToolName = {
  SaveMemory: "save_memory",
  DeleteMemory: "delete_memory",
  SearchMemory: "search_memory",
} as const;

/**
 * Creates AI-callable memory tools bound to a specific user.
 * The AI will autonomously decide when to save/delete/search memories
 * based on conversation context.
 */
export function createMemoryTools(userId: string) {
  const saveMemoryTool = createTool({
    description: `Save an important fact, preference, or piece of personal information about the user to long-term memory. Use this when the user shares something worth remembering for future conversations — such as their name, preferences, work details, projects, interests, goals, or any personal information. Be selective: only save genuinely useful facts, not transient conversation details. Write the memory as a concise, third-person factual statement (e.g., "User prefers dark mode" or "User works as a backend engineer at Acme Corp").`,
    inputSchema: jsonSchema<{
      content: string;
      category?: string;
    }>({
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "The fact to remember, written as a concise third-person statement",
        },
        category: {
          type: "string",
          description:
            "Optional category for organization (e.g., 'preference', 'work', 'personal', 'project', 'technical')",
        },
      },
      required: ["content"],
    }),
    execute: async ({ content, category }) => {
      try {
        // Check for near-duplicate before saving
        const existing = await memoryRepository.search(userId, content);
        const isDuplicate = existing.some((m) => {
          const similarity = computeSimilarity(
            m.content.toLowerCase(),
            content.toLowerCase(),
          );
          return similarity > 0.7;
        });
        if (isDuplicate) {
          return {
            status: "skipped",
            message: "A similar memory already exists.",
          };
        }
        const memory = await memoryRepository.create({
          userId,
          content,
          category,
        });
        return {
          status: "saved",
          message: `Memory saved: "${content}"`,
          id: memory.id,
        };
      } catch (error: any) {
        return {
          status: "error",
          message: `Failed to save memory: ${error.message}`,
        };
      }
    },
  });

  const deleteMemoryTool = createTool({
    description: `Delete a previously saved memory. Use this when the user explicitly asks to forget something, or when you know a previously saved fact is outdated or incorrect. You need the memory ID to delete it — use search_memory first if needed to find the right one.`,
    inputSchema: jsonSchema<{
      memoryId: string;
      reason?: string;
    }>({
      type: "object",
      properties: {
        memoryId: {
          type: "string",
          description: "The ID of the memory to delete",
        },
        reason: {
          type: "string",
          description: "Why this memory is being deleted",
        },
      },
      required: ["memoryId"],
    }),
    execute: async ({ memoryId, reason }) => {
      try {
        const deleted = await memoryRepository.delete(memoryId, userId);
        if (!deleted) {
          return { status: "not_found", message: "Memory not found." };
        }
        return {
          status: "deleted",
          message: `Memory deleted${reason ? `: ${reason}` : ""}.`,
        };
      } catch (error: any) {
        return {
          status: "error",
          message: `Failed to delete memory: ${error.message}`,
        };
      }
    },
  });

  const searchMemoryTool = createTool({
    description: `Search through saved memories about the user. Use this to recall previously saved facts, preferences, or context when it would help personalize your response. Search with relevant keywords. For example, if the user mentions a project, search for it to retrieve context from past conversations.`,
    inputSchema: jsonSchema<{
      query: string;
    }>({
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search keywords to find relevant memories (e.g., 'favorite language', 'work project', 'name')",
        },
      },
      required: ["query"],
    }),
    execute: async ({ query }) => {
      try {
        const memories = await memoryRepository.search(userId, query);
        if (memories.length === 0) {
          return { status: "empty", message: "No matching memories found." };
        }
        return {
          status: "found",
          count: memories.length,
          memories: memories.map((m) => ({
            id: m.id,
            content: m.content,
            category: m.category,
            savedAt: m.createdAt,
          })),
        };
      } catch (error: any) {
        return {
          status: "error",
          message: `Failed to search memories: ${error.message}`,
        };
      }
    },
  });

  return {
    [MemoryToolName.SaveMemory]: saveMemoryTool,
    [MemoryToolName.DeleteMemory]: deleteMemoryTool,
    [MemoryToolName.SearchMemory]: searchMemoryTool,
  };
}

/**
 * Simple word-overlap similarity (Jaccard-like).
 * Returns 0..1 indicating how similar two strings are.
 */
function computeSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/).filter(Boolean));
  const setB = new Set(b.split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
