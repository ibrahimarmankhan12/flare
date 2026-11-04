import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_products", "list_features", "get_feature", "create_feature"]),
  productId: z.string().optional(),
  featureId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface ProductboardToolInput {
  action: "list_products" | "list_features" | "get_feature" | "create_feature";
  productId?: string;
  featureId?: string;
  name?: string;
  description?: string;
  limit?: number;
}

const PRODUCTBOARD_API = "https://api.productboard.com";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "productboard"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("productboard", rows[0]);
}

export function createProductboardToolForUser(userId: string): Tool {
  return createTool({
    description: `Productboard integration tool.

Actions:
- list_products: List products.
- list_features: List features for a product (requires: productId).
- get_feature: Read a feature (requires: featureId).
- create_feature: Create a feature (requires: productId, name).`,
    inputSchema,
    execute: async (input: ProductboardToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return { error: "Productboard is not connected." };
        }
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };

        if (action === "list_products") {
          const res = await fetch(`${PRODUCTBOARD_API}/products`, { headers });
          const data = (await res.json()) as { data?: any[] };
          return { products: (data.data || []).slice(0, limit) };
        }
        if (action === "list_features") {
          if (!input.productId) return { error: "productId required" };
          const params = new URLSearchParams({
            "product.id": input.productId,
            pageLimit: String(limit),
          });
          const res = await fetch(
            `${PRODUCTBOARD_API}/features?${params}`,
            { headers },
          );
          const data = (await res.json()) as { data?: any[] };
          return { features: data.data || [] };
        }
        if (action === "get_feature") {
          if (!input.featureId) return { error: "featureId required" };
          const res = await fetch(`${PRODUCTBOARD_API}/features/${input.featureId}`, { headers });
          return await res.json();
        }
        if (action === "create_feature") {
          if (!input.productId || !input.name) {
            return { error: "productId and name required" };
          }
          const res = await fetch(`${PRODUCTBOARD_API}/features`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              data: {
                name: input.name,
                description: input.description,
                product: { id: input.productId },
              },
            }),
          });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Productboard tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Productboard operation failed.",
        };
      }
    },
  });
}

export const productboardTool = createTool({
  description: "Productboard tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Productboard tool requires user context." }),
});
