import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import { ApiKey, ApiKeyTable, NewApiKey } from "../schema.pg";

// ---------------------------------------------------------------------------
// P3.0 schema foundation — API key repository
// ---------------------------------------------------------------------------
// CRUD stubs for the `api_key` table. The actual key generation /
// sha-256 hashing / prefix extraction is the caller's responsibility
// (see `src/lib/api-keys/issue.ts` in P3.3) — the repository only ever
// sees the hash. Plaintext keys are NEVER accepted by any method on
// this object.
// ---------------------------------------------------------------------------

export interface CreateApiKeyInput {
  name: string;
  keyHash: string;
  prefix: string;
  scopes?: string[];
  expiresAt?: Date | null;
  rotatedFromKeyId?: string | null;
  rotationGraceEndsAt?: Date | null;
  lastFour?: string | null;
}

export interface UpdateApiKeyInput {
  name?: string;
  scopes?: string[];
  expiresAt?: Date | null;
}

export const apiKeyRepository = {
  /**
   * Persist a new key. `keyHash` is the sha-256 of the plaintext key
   * (computed at the call site via
   * `crypto.createHash('sha256').update(key).digest('hex')`); the
   * repository does not hash, so it does not need to import crypto.
   */
  async createApiKey(
    input: CreateApiKeyInput,
    userId: string,
  ): Promise<ApiKey> {
    const [row] = await db
      .insert(ApiKeyTable)
      .values({
        userId,
        name: input.name,
        keyHash: input.keyHash,
        prefix: input.prefix,
        scopes: input.scopes ?? [],
        expiresAt: input.expiresAt ?? null,
        rotatedFromKeyId: input.rotatedFromKeyId ?? null,
        rotationGraceEndsAt: input.rotationGraceEndsAt ?? null,
        lastFour: input.lastFour ?? null,
      } satisfies NewApiKey)
      .returning();
    return row as ApiKey;
  },

  /**
   * Look up by hash. This is the public path the REST auth middleware
   * hits on every `Authorization: Bearer …` request. Does NOT enforce
   * revocation / expiry — the caller is expected to check
   * `revokedAt == null && (expiresAt == null || expiresAt > now)`.
   * Returns null on miss.
   */
  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const [row] = await db
      .select()
      .from(ApiKeyTable)
      .where(eq(ApiKeyTable.keyHash, keyHash));
    return (row as ApiKey | undefined) ?? null;
  },

  /**
   * List a user's active (non-revoked) keys, newest first. Excludes
   * the `keyHash` from the projection at the call site if you want to
   * keep it out of the UI.
   */
  async listApiKeys(userId: string): Promise<ApiKey[]> {
    return (await db
      .select()
      .from(ApiKeyTable)
      .where(and(eq(ApiKeyTable.userId, userId), isNull(ApiKeyTable.revokedAt)))
      .orderBy(desc(ApiKeyTable.createdAt))) as ApiKey[];
  },

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await db
      .update(ApiKeyTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(ApiKeyTable.id, id));
  },

  /**
   * Soft-revoke. Sets `revokedAt` to now; the row is retained for
   * audit. The `getApiKeyByHash` path will still find the row — the
   * auth middleware is responsible for rejecting it.
   */
  async revokeApiKey(id: string, userId: string): Promise<ApiKey | null> {
    const [row] = await db
      .update(ApiKeyTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(ApiKeyTable.id, id), eq(ApiKeyTable.userId, userId)))
      .returning();
    return (row as ApiKey | undefined) ?? null;
  },

  async updateApiKey(
    id: string,
    userId: string,
    patch: UpdateApiKeyInput,
  ): Promise<ApiKey | null> {
    const set: Partial<NewApiKey> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.scopes !== undefined) set.scopes = patch.scopes;
    if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt;
    if (Object.keys(set).length === 0) {
      // No-op: just return the current row if it exists.
      return await apiKeyRepository.getApiKey(id, userId);
    }
    const [row] = await db
      .update(ApiKeyTable)
      .set(set)
      .where(and(eq(ApiKeyTable.id, id), eq(ApiKeyTable.userId, userId)))
      .returning();
    return (row as ApiKey | undefined) ?? null;
  },

  async getApiKey(id: string, userId: string): Promise<ApiKey | null> {
    const [row] = await db
      .select()
      .from(ApiKeyTable)
      .where(and(eq(ApiKeyTable.id, id), eq(ApiKeyTable.userId, userId)));
    return (row as ApiKey | undefined) ?? null;
  },

  async rotateApiKey(
    oldKeyId: string,
    userId: string,
    newKeyData: CreateApiKeyInput,
    graceEndsAt: Date,
  ): Promise<ApiKey> {
    return await db.transaction(async (tx) => {
      await tx
        .update(ApiKeyTable)
        .set({ rotationGraceEndsAt: graceEndsAt })
        .where(
          and(eq(ApiKeyTable.id, oldKeyId), eq(ApiKeyTable.userId, userId)),
        );

      const [row] = await tx
        .insert(ApiKeyTable)
        .values({
          userId,
          name: newKeyData.name,
          keyHash: newKeyData.keyHash,
          prefix: newKeyData.prefix,
          scopes: newKeyData.scopes ?? [],
          expiresAt: newKeyData.expiresAt ?? null,
          rotatedFromKeyId: oldKeyId,
          rotationGraceEndsAt: null,
          lastFour: newKeyData.lastFour ?? null,
        } satisfies NewApiKey)
        .returning();
      return row as ApiKey;
    });
  },

  async getApiKeyUsageSafeFields(
    id: string,
    userId: string,
  ): Promise<Pick<
    ApiKey,
    | "id"
    | "userId"
    | "name"
    | "prefix"
    | "scopes"
    | "lastUsedAt"
    | "expiresAt"
    | "revokedAt"
    | "rotatedFromKeyId"
    | "rotationGraceEndsAt"
    | "lastFour"
    | "createdAt"
  > | null> {
    const [row] = await db
      .select({
        id: ApiKeyTable.id,
        userId: ApiKeyTable.userId,
        name: ApiKeyTable.name,
        prefix: ApiKeyTable.prefix,
        scopes: ApiKeyTable.scopes,
        lastUsedAt: ApiKeyTable.lastUsedAt,
        expiresAt: ApiKeyTable.expiresAt,
        revokedAt: ApiKeyTable.revokedAt,
        rotatedFromKeyId: ApiKeyTable.rotatedFromKeyId,
        rotationGraceEndsAt: ApiKeyTable.rotationGraceEndsAt,
        lastFour: ApiKeyTable.lastFour,
        createdAt: ApiKeyTable.createdAt,
      })
      .from(ApiKeyTable)
      .where(and(eq(ApiKeyTable.id, id), eq(ApiKeyTable.userId, userId)));
    return row ?? null;
  },
};
