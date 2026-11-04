import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  InboundDelivery,
  InboundDeliveryTable,
  InboundEndpoint,
  InboundEndpointTable,
  NewInboundDelivery,
  NewInboundEndpoint,
} from "../schema.pg";

// ---------------------------------------------------------------------------
// P3.0 schema foundation — inbound repository
// ---------------------------------------------------------------------------
// CRUD stubs for the `inbound_endpoint` + `inbound_delivery` tables. The
// actual adapter logic (SendGrid Inbound Parse, SES, Slack event
// normalization) lives in P3.2 (src/lib/inbound/). This file is the
// data-access layer:
//   * createInboundEndpoint / listInboundEndpoints — owner-scoped CRUD.
//   * getInboundEndpointByToken — the public lookup the inbound route
//     uses; tokens are unique so this is single-row.
//   * updateInboundEndpoint / deleteInboundEndpoint — owner-scoped
//     patches.
//   * createInboundDelivery / updateInboundDelivery — append-only audit
//     of inbound calls.
//   * listInboundDeliveries — owner-scoped (joins through the endpoint
//     so the userId check is at the query level).
// ---------------------------------------------------------------------------

export interface CreateInboundEndpointInput {
  agentId: string;
  token: string;
  secretHash?: string | null;
  kind: "webhook" | "email" | "slack";
  threadTemplate?: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateInboundEndpointInput {
  secretHash?: string | null;
  kind?: "webhook" | "email" | "slack";
  threadTemplate?: Record<string, unknown>;
  enabled?: boolean;
}

export interface CreateInboundDeliveryInput {
  inboundEndpointId: string;
  payload: Record<string, unknown>;
  status?: "received" | "normalized" | "failed" | "replayed";
  error?: string | null;
}

export interface UpdateInboundDeliveryInput {
  status?: "received" | "normalized" | "failed" | "replayed";
  error?: string | null;
}

export const inboundRepository = {
  async createInboundEndpoint(
    input: CreateInboundEndpointInput,
    userId: string,
  ): Promise<InboundEndpoint> {
    const [row] = await db
      .insert(InboundEndpointTable)
      .values({
        userId,
        agentId: input.agentId,
        token: input.token,
        secretHash: input.secretHash ?? null,
        kind: input.kind,
        threadTemplate: input.threadTemplate ?? {},
        enabled: input.enabled ?? true,
      } satisfies NewInboundEndpoint)
      .returning();
    return row as InboundEndpoint;
  },

  /**
   * Token-based lookup. The inbound route receives a `/api/inbound/[token]`
   * hit, so this is the public path — no userId scope (the endpoint
   * IS the auth). Returns null if the token is unknown or the endpoint
   * is disabled.
   */
  async getInboundEndpointByToken(
    token: string,
  ): Promise<InboundEndpoint | null> {
    const [row] = await db
      .select()
      .from(InboundEndpointTable)
      .where(eq(InboundEndpointTable.token, token));
    if (!row) return null;
    if (!(row as InboundEndpoint).enabled) return null;
    return row as InboundEndpoint;
  },

  async listInboundEndpoints(userId: string): Promise<InboundEndpoint[]> {
    return (await db
      .select()
      .from(InboundEndpointTable)
      .where(eq(InboundEndpointTable.userId, userId))
      .orderBy(desc(InboundEndpointTable.createdAt))) as InboundEndpoint[];
  },

  async updateInboundEndpoint(
    id: string,
    userId: string,
    patch: UpdateInboundEndpointInput,
  ): Promise<InboundEndpoint | null> {
    const [row] = await db
      .update(InboundEndpointTable)
      .set({
        ...(patch.secretHash !== undefined
          ? { secretHash: patch.secretHash }
          : {}),
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
        ...(patch.threadTemplate !== undefined
          ? { threadTemplate: patch.threadTemplate }
          : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      })
      .where(
        and(
          eq(InboundEndpointTable.id, id),
          eq(InboundEndpointTable.userId, userId),
        ),
      )
      .returning();
    return (row as InboundEndpoint | undefined) ?? null;
  },

  async deleteInboundEndpoint(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(InboundEndpointTable)
      .where(
        and(
          eq(InboundEndpointTable.id, id),
          eq(InboundEndpointTable.userId, userId),
        ),
      )
      .returning({ id: InboundEndpointTable.id });
    return result.length > 0;
  },

  async createInboundDelivery(
    input: CreateInboundDeliveryInput,
  ): Promise<InboundDelivery> {
    const [row] = await db
      .insert(InboundDeliveryTable)
      .values({
        inboundEndpointId: input.inboundEndpointId,
        payload: input.payload,
        status: input.status ?? "received",
        error: input.error ?? null,
      } satisfies NewInboundDelivery)
      .returning();
    return row as InboundDelivery;
  },

  async updateInboundDelivery(
    id: string,
    patch: UpdateInboundDeliveryInput,
  ): Promise<InboundDelivery | null> {
    const [row] = await db
      .update(InboundDeliveryTable)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
      })
      .where(eq(InboundDeliveryTable.id, id))
      .returning();
    return (row as InboundDelivery | undefined) ?? null;
  },

  async listInboundDeliveries(
    endpointId: string,
    userId: string,
    limit = 50,
  ): Promise<InboundDelivery[]> {
    // Owner-scope: a delivery is only visible if its parent endpoint
    // belongs to the calling user.
    return (await db
      .select({
        id: InboundDeliveryTable.id,
        inboundEndpointId: InboundDeliveryTable.inboundEndpointId,
        receivedAt: InboundDeliveryTable.receivedAt,
        status: InboundDeliveryTable.status,
        error: InboundDeliveryTable.error,
        payload: InboundDeliveryTable.payload,
      })
      .from(InboundDeliveryTable)
      .innerJoin(
        InboundEndpointTable,
        eq(InboundDeliveryTable.inboundEndpointId, InboundEndpointTable.id),
      )
      .where(
        and(
          eq(InboundDeliveryTable.inboundEndpointId, endpointId),
          eq(InboundEndpointTable.userId, userId),
        ),
      )
      .orderBy(sql`${InboundDeliveryTable.receivedAt} DESC`)
      .limit(limit)) as InboundDelivery[];
  },
};
