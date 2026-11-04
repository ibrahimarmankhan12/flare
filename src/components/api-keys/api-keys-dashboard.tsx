"use client";

import { useEffect, useState } from "react";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastFour: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function ApiKeysDashboard() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("Default key");
  const [scopes, setScopes] = useState(
    "threads:read,threads:write,messages:write",
  );
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadKeys = async () => {
    const res = await fetch("/api/api-key", { cache: "no-store" });
    if (!res.ok) {
      setMessage(`Failed to load API keys (${res.status})`);
      return;
    }
    const body = await res.json();
    setKeys(body.keys ?? []);
  };

  useEffect(() => {
    void loadKeys();
  }, []);

  const createKey = async () => {
    const res = await fetch("/api/api-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        scopes: scopes
          .split(",")
          .map((scope) => scope.trim())
          .filter(Boolean),
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(`Create failed (${res.status})`);
      return;
    }
    setRevealedKey(body.fullKey);
    setMessage("Key created. Copy it now; it will not be shown again.");
    await loadKeys();
  };

  const revokeKey = async (id: string) => {
    const res = await fetch(`/api/api-key/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setMessage(`Revoke failed (${res.status})`);
      return;
    }
    setMessage("Key revoked.");
    await loadKeys();
  };

  const rotateKey = async (id: string) => {
    const res = await fetch(`/api/api-key/${id}/rotate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graceHours: 24 }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(`Rotate failed (${res.status})`);
      return;
    }
    setRevealedKey(body.fullKey);
    setMessage("Key rotated. Copy the new key now.");
    await loadKeys();
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-semibold text-2xl">API keys</h1>
        <p className="text-muted-foreground text-sm">
          Create, revoke, rotate, and inspect API key usage.
        </p>
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 font-medium">Create key</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded border bg-background px-3 py-2"
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            value={name}
          />
          <input
            className="rounded border bg-background px-3 py-2"
            onChange={(event) => setScopes(event.target.value)}
            placeholder="Comma-separated scopes"
            value={scopes}
          />
        </div>
        <button
          className="mt-3 rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={createKey}
          type="button"
        >
          Create
        </button>
      </section>

      {message ? <p className="text-sm">{message}</p> : null}
      {revealedKey ? (
        <pre className="overflow-auto rounded border bg-muted p-3 text-sm">
          {revealedKey}
        </pre>
      ) : null}

      <section className="overflow-hidden rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Key</th>
              <th className="p-3">Scopes</th>
              <th className="p-3">Last used</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr className="border-t" key={key.id}>
                <td className="p-3">{key.name}</td>
                <td className="p-3 font-mono">
                  {key.prefix}
                  {key.lastFour ? key.lastFour : ""}
                </td>
                <td className="p-3">{key.scopes.join(", ") || "—"}</td>
                <td className="p-3">
                  {key.lastUsedAt
                    ? new Date(key.lastUsedAt).toLocaleString()
                    : "Never"}
                </td>
                <td className="flex gap-2 p-3">
                  <a
                    className="underline"
                    href={`/api/api-key/${key.id}/usage`}
                  >
                    Usage
                  </a>
                  <button
                    className="underline"
                    onClick={() => rotateKey(key.id)}
                    type="button"
                  >
                    Rotate
                  </button>
                  <button
                    className="text-destructive underline"
                    onClick={() => revokeKey(key.id)}
                    type="button"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
