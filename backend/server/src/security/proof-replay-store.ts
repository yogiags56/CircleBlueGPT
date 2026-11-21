import { createHash } from "node:crypto";
import type Redis from "ioredis";

const DEFAULT_PREFIX = "cortanagpt:proof-replay:v1:";

export class ProofReplayStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = DEFAULT_PREFIX
  ) {}

  /**
   * Atomically claims a proof identifier for one session.
   * Returns false when that session has already presented the same proof ID.
   * Signature verification and timestamp validation must happen before calling this.
   */
  async claim(sessionId: string, proofJti: string, ttlSeconds: number): Promise<boolean> {
    if (!sessionId || sessionId.length > 128) throw new Error("INVALID_SESSION_ID");
    if (!proofJti || proofJti.length > 128) throw new Error("INVALID_PROOF_ID");
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) {
      throw new Error("INVALID_REPLAY_TTL");
    }

    const digest = createHash("sha256")
      .update(sessionId, "utf8")
      .update("\\0")
      .update(proofJti, "utf8")
      .digest("hex");
    const result = await this.redis.set(
      this.prefix + digest,
      "1",
      "EX",
      ttlSeconds,
      "NX"
    );
    return result === "OK";
  }
}
