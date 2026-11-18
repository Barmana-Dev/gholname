import type { IncrementResponse, Options, Store } from "express-rate-limit";
import { config } from "./config.js";
import { db } from "./db.js";

/**
 * Fixed-window counters used by rate limiters and by per-account/per-upload
 * limits. In "database" mode the counters live in MySQL (table
 * rate_limit_hits) so every process/replica shares one budget; in "memory"
 * mode they are per process (development only).
 */
class MemoryCounterStore implements Store {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly keyPrefix: string,
    private windowMs: number,
  ) {}
  init(options: Options): void {
    this.windowMs = options.windowMs;
  }
  async increment(key: string): Promise<IncrementResponse> {
    const now = Date.now();
    const id = `${this.keyPrefix}:${key}`;
    let entry = this.hits.get(id);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(id, entry);
    }
    entry.count += 1;
    return { totalHits: entry.count, resetTime: new Date(entry.resetAt) };
  }
  async decrement(key: string): Promise<void> {
    const entry = this.hits.get(`${this.keyPrefix}:${key}`);
    if (entry && entry.count > 0) entry.count -= 1;
  }
  async resetKey(key: string): Promise<void> {
    this.hits.delete(`${this.keyPrefix}:${key}`);
  }
}

class DatabaseCounterStore implements Store {
  constructor(
    private readonly keyPrefix: string,
    private windowMs: number,
  ) {}
  init(options: Options): void {
    this.windowMs = options.windowMs;
  }
  private id(key: string): string {
    return `${this.keyPrefix}:${key}`.slice(0, 190);
  }
  async increment(key: string): Promise<IncrementResponse> {
    const id = this.id(key);
    // Atomic: one statement either starts a new window or increments the
    // current one. Assignments run left to right, so `hits` is evaluated
    // against the old reset_at.
    await db.execute(
      "INSERT INTO rate_limit_hits (rl_key,hits,reset_at) VALUES (?,1,DATE_ADD(NOW(3),INTERVAL ? MICROSECOND)) ON DUPLICATE KEY UPDATE hits=IF(reset_at<=NOW(3),1,hits+1),reset_at=IF(reset_at<=NOW(3),VALUES(reset_at),reset_at)",
      [id, this.windowMs * 1000],
    );
    const [found] = await db.execute<any[]>(
      "SELECT hits,reset_at FROM rate_limit_hits WHERE rl_key=?",
      [id],
    );
    const row = found[0];
    return {
      totalHits: Number(row?.hits ?? 1),
      resetTime: row?.reset_at ? new Date(row.reset_at) : undefined,
    };
  }
  async decrement(key: string): Promise<void> {
    await db.execute(
      "UPDATE rate_limit_hits SET hits=GREATEST(hits-1,0) WHERE rl_key=?",
      [this.id(key)],
    );
  }
  async resetKey(key: string): Promise<void> {
    await db.execute("DELETE FROM rate_limit_hits WHERE rl_key=?", [this.id(key)]);
  }
}

export function createCounterStore(prefix: string, windowMs: number): Store {
  return config.RATE_LIMIT_STORE === "database"
    ? new DatabaseCounterStore(prefix, windowMs)
    : new MemoryCounterStore(prefix, windowMs);
}

/** Counts one attempt for `key`; returns false once `limit` is exceeded. */
export async function consumeLimit(
  store: Store,
  key: string,
  limit: number,
): Promise<boolean> {
  const { totalHits } = await store.increment(key);
  return totalHits <= limit;
}

export async function purgeExpiredRateLimits(): Promise<void> {
  if (config.RATE_LIMIT_STORE !== "database") return;
  await db.execute("DELETE FROM rate_limit_hits WHERE reset_at<NOW(3)");
}
