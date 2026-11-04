const N8N_BASE_URL = process.env.N8N_BASE_URL ?? "http://127.0.0.1:5678";
const N8N_ADMIN_EMAIL = process.env.N8N_ADMIN_EMAIL ?? "admin@example.com";
const N8N_ADMIN_PASSWORD = process.env.N8N_ADMIN_PASSWORD ?? "";
const N8N_EDITOR_URL =
  process.env.N8N_EDITOR_URL ?? "https://n8n.flare-sh.tech";

export type N8nWorkflow = {
  id: string;
  name: string;
  active: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type N8nUserCreation = {
  user: {
    id: string;
    email: string;
    inviteAcceptUrl: string;
  };
};

export class N8nError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const cookieCache = new Map<string, { cookie: string; expiresAt: number }>();
const pendingLogins = new Map<string, Promise<string>>();

async function loginAs(email: string, password: string): Promise<string> {
  const cached = cookieCache.get(email);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.cookie;
  }
  const pending = pendingLogins.get(email);
  if (pending) {
    return pending;
  }
  const login = (async () => {
    const res = await fetch(`${N8N_BASE_URL}/rest/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailOrLdapLoginId: email, password }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new N8nError(`n8n login error ${res.status}`, res.status);
    }
    const setCookie = res.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/n8n-auth=([^;]+)/);
    if (!match) {
      throw new N8nError("No session cookie returned", 500);
    }
    const token = match[1];
    let expiresAt = Date.now() + 6 * 60 * 60 * 1000;
    try {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
      ) as { exp?: number };
      if (payload.exp) {
        expiresAt = payload.exp * 1000;
      }
    } catch {
      // keep default expiry
    }
    cookieCache.set(email, { cookie: token, expiresAt });
    return token;
  })();
  pendingLogins.set(email, login);
  try {
    return await login;
  } finally {
    pendingLogins.delete(email);
  }
}

async function restApi<T>(
  path: string,
  init?: RequestInit & { cookie?: string },
): Promise<T> {
  const res = await fetch(`${N8N_BASE_URL}/rest${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.cookie ? { Cookie: `n8n-auth=${init.cookie}` } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new N8nError(`n8n API error ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

async function withRetry<T>(fn: () => Promise<T>, invalidate: () => void): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof N8nError && err.status === 401) {
      invalidate();
      return fn();
    }
    throw err;
  }
}

export function createUserClient(email: string, password: string) {
  const invalidate = () => cookieCache.delete(email);
  return {
    async listWorkflows(): Promise<N8nWorkflow[]> {
      return withRetry(async () => {
        const cookie = await loginAs(email, password);
        const body = await restApi<{ data: N8nWorkflow[] }>(
          "/workflows?limit=100",
          { cookie },
        );
        return body.data;
      }, invalidate);
    },
    async getWorkflow(id: string): Promise<N8nWorkflow> {
      return withRetry(async () => {
        const cookie = await loginAs(email, password);
        const body = await restApi<{ data: N8nWorkflow }>(`/workflows/${id}`, {
          cookie,
        });
        return body.data;
      }, invalidate);
    },
    async createWorkflow(
      name: string,
      description?: string,
    ): Promise<N8nWorkflow> {
      return withRetry(async () => {
        const cookie = await loginAs(email, password);
        const body = await restApi<{ data: N8nWorkflow }>("/workflows", {
          method: "POST",
          cookie,
          body: JSON.stringify({
            name,
            ...(description ? { description } : {}),
            nodes: [],
            connections: {},
            settings: { executionOrder: "v1" },
          }),
        });
        return body.data;
      }, invalidate);
    },
    async updateWorkflow(
      id: string,
      patch: {
        name?: string;
        description?: string;
        active?: boolean;
      },
    ): Promise<N8nWorkflow> {
      return withRetry(async () => {
        const cookie = await loginAs(email, password);
        const body = await restApi<{ data: N8nWorkflow }>(`/workflows/${id}`, {
          method: "PATCH",
          cookie,
          body: JSON.stringify(patch),
        });
        return body.data;
      }, invalidate);
    },
    async deleteWorkflow(id: string): Promise<void> {
      await withRetry(async () => {
        const cookie = await loginAs(email, password);
        await restApi(`/workflows/${id}/archive`, {
          method: "POST",
          cookie,
          body: JSON.stringify({}),
        });
        await restApi(`/workflows/${id}`, {
          method: "DELETE",
          cookie,
          body: JSON.stringify({}),
        });
      }, invalidate);
    },
    async runWorkflow(id: string): Promise<unknown> {
      return withRetry(async () => {
        const cookie = await loginAs(email, password);
        return restApi(`/workflows/${id}/run`, {
          method: "POST",
          cookie,
          body: JSON.stringify({ includeData: false }),
        });
      }, invalidate);
    },
  };
}

export function createAdminClient() {
  return {
    async createUser(email: string): Promise<N8nUserCreation> {
      return withRetry(async () => {
        const cookie = await loginAs(N8N_ADMIN_EMAIL, N8N_ADMIN_PASSWORD);
        const body = await restApi<{
          data: Array<N8nUserCreation | { error: string }>;
        }>("/invitations", {
          method: "POST",
          cookie,
          body: JSON.stringify([{ email, role: "global:member" }]),
        });
        const entry = body.data[0];
        if (!entry || !("user" in entry)) {
          throw new N8nError(
            `Invitation failed: ${JSON.stringify(entry)}`,
            500,
          );
        }
        return entry;
      }, () => cookieCache.delete(N8N_ADMIN_EMAIL));
    },
  };
}

export function editorUrl(id: string): string {
  return `${N8N_EDITOR_URL}/workflow/${id}`;
}