import { createHash } from "node:crypto";
import type Redis from "ioredis";

const DEFAULT_PREFIX = "cortanagpt:chat-rate:v1:";
const CONSUME_SCRIPT = [
  "local current = redis.call('INCR', KEYS[1])",
  "if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
  "local ttl = redis.call('TTL', KEYS[1])",
  "return {current, ttl}"
].join("\n");

export interface ChatRateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAfterSeconds: number;
}

/** Atomic fixed-window per-installation limiter. Redis errors intentionally propagate. */
export class ChatRateLimitStore {
  constructor(private readonly redis: Redis, private readonly prefix = DEFAULT_PREFIX) {}

  async consume(sessionId: string, limit: number, windowSeconds: number): Promise<ChatRateLimitDecision> {
    if (!sessionId || sessionId.length > 128) throw new Error("INVALID_SESSION_ID");
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error("INVALID_RATE_LIMIT");
    if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400) {
      throw new Error("INVALID_RATE_WINDOW");
    }
    const digest = createHash("sha256").update(sessionId, "utf8").digest("hex");
    const result = await this.redis.eval(
      CONSUME_SCRIPT, 1, this.prefix + digest, String(windowSeconds)
    ) as [number | string, number | string];
    const count = Number(result[0]);
    const ttl = Math.max(1, Number(result[1]));
    if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(ttl)) {
      throw new Error("RATE_LIMIT_STORE_INVALID_RESPONSE");
    }
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAfterSeconds: ttl
    };
  }
}
