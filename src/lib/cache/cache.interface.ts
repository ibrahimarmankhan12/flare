export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlMs?: number): Promise<void>;
  /**
   * Set if not exists. Atomically set the key with the given TTL only when
   * no value is already present. Returns `true` if the key was set by this
   * call (caller acquired the lock), `false` if a value already existed.
   * Used for distributed leader election.
   */
  setNX(key: string, value: unknown, ttlMs: number): Promise<boolean>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  getAll(): Promise<Map<string, unknown>>;
}
