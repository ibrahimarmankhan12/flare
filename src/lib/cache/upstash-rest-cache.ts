import { Cache } from "./cache.interface";

export interface UpstashRestCacheOptions {
  restUrl: string;
  restToken: string;
  defaultTtlMs?: number;
  keyPrefix?: string;
}

type UpstashResponse<T = unknown> = {
  result?: T;
  error?: string;
};

const READ_ONLY_COMMANDS = new Set(["GET", "EXISTS", "KEYS", "MGET", "PING"]);

export class UpstashRestCache implements Cache {
  private readonly restUrl: string;
  private readonly restToken: string;
  private readonly defaultTtlMs: number;
  private readonly keyPrefix: string;

  constructor(options: UpstashRestCacheOptions) {
    this.restUrl = options.restUrl.replace(/\/+$/, "");
    this.restToken = options.restToken;
    this.defaultTtlMs = options.defaultTtlMs ?? Infinity;
    this.keyPrefix = options.keyPrefix ?? "";
  }

  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private async execute<T = unknown>(
    command: Array<string | number>,
  ): Promise<T> {
    const [commandName] = command;
    if (typeof commandName !== "string" || commandName.length === 0) {
      throw new Error("Upstash error: Invalid command");
    }

    const method = READ_ONLY_COMMANDS.has(commandName.toUpperCase())
      ? "GET"
      : "POST";
    const path = command
      .map((part) => encodeURIComponent(String(part)))
      .join("/");

    const response = await fetch(`${this.restUrl}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Upstash command failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as UpstashResponse<T>;
    if (data.error) {
      throw new Error(`Upstash error: ${data.error}`);
    }
    return data.result as T;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.execute<string | null>(["GET", this.getKey(key)]);
    if (value == null) return undefined;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const ttl = ttlMs ?? this.defaultTtlMs;
    const cacheKey = this.getKey(key);

    if (isFinite(ttl)) {
      await this.execute([
        "SET",
        cacheKey,
        serialized,
        "PX",
        Math.max(1, Math.floor(ttl)),
      ]);
      return;
    }

    await this.execute(["SET", cacheKey, serialized]);
  }

  async setNX(key: string, value: unknown, ttlMs: number): Promise<boolean> {
    const serialized = JSON.stringify(value);
    const result = await this.execute<string | null>([
      "SET",
      this.getKey(key),
      serialized,
      "PX",
      Math.max(1, Math.floor(ttlMs)),
      "NX",
    ]);
    return result === "OK";
  }

  async has(key: string): Promise<boolean> {
    const result = await this.execute<number>(["EXISTS", this.getKey(key)]);
    return result === 1;
  }

  async delete(key: string): Promise<void> {
    await this.execute(["DEL", this.getKey(key)]);
  }

  async clear(): Promise<void> {
    if (!this.keyPrefix) {
      await this.execute(["FLUSHDB"]);
      return;
    }

    const keys = await this.execute<string[]>(["KEYS", `${this.keyPrefix}*`]);
    if (!keys?.length) return;
    await this.execute(["DEL", ...keys]);
  }

  async getAll(): Promise<Map<string, unknown>> {
    const entries = new Map<string, unknown>();
    const keys = await this.execute<string[]>(["KEYS", `${this.keyPrefix}*`]);
    if (!keys?.length) return entries;

    const values = await this.execute<(string | null)[]>(["MGET", ...keys]);

    keys.forEach((key, index) => {
      const rawValue = values[index];
      if (rawValue == null) return;

      const cleanKey = this.keyPrefix ? key.slice(this.keyPrefix.length) : key;
      try {
        entries.set(cleanKey, JSON.parse(rawValue));
      } catch {
        entries.set(cleanKey, rawValue);
      }
    });

    return entries;
  }
}
