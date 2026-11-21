import { randomBytes } from "node:crypto";
import type { Pool } from "pg";

export interface IssuedEnrollmentChallenge {
  challengeId: string;
  nonce: string;
  expiresInSeconds: number;
}

export interface ConsumedEnrollmentChallenge {
  nonce: Buffer;
  expiresAt: Date;
}

/**
 * Persistence primitive for first-time enrollment challenges.
 * Challenge consumption commits before caller verifies the signature, so a
 * failed proof cannot be retried with the same challenge.
 */
export class EnrollmentChallengeRepository {
  constructor(private readonly pool: Pool) {}

  async issueEnrollmentChallenge(ttlSeconds = 120): Promise<IssuedEnrollmentChallenge> {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 300) {
      throw new Error("INVALID_CHALLENGE_TTL");
    }

    const challengeId = randomBytes(24).toString("base64url");
    const nonce = randomBytes(32);
    const result = await this.pool.query<{ expires_at: Date }>(
      `INSERT INTO enrollment_challenges
         (challenge_id, purpose, nonce, session_id, expires_at)
       VALUES ($1, 'enroll', $2, NULL, NOW() + ($3 * INTERVAL '1 second'))
       RETURNING expires_at`,
      [challengeId, nonce, ttlSeconds]
    );

    if (result.rowCount !== 1) throw new Error("CHALLENGE_CREATE_FAILED");
    return {
      challengeId,
      nonce: nonce.toString("base64url"),
      expiresInSeconds: ttlSeconds
    };
  }

  /**
   * Atomically consumes a live enrollment challenge exactly once.
   * Returns null for unknown, expired, already consumed, or non-enrollment challenges.
   */
  async consumeEnrollmentChallenge(
    challengeId: string
  ): Promise<ConsumedEnrollmentChallenge | null> {
    if (!/^[A-Za-z0-9_-]{32}$/.test(challengeId)) {
      throw new Error("INVALID_CHALLENGE_ID");
    }

    const result = await this.pool.query<{
      nonce: Buffer;
      expires_at: Date;
    }>(
      `UPDATE enrollment_challenges
          SET consumed_at = NOW()
        WHERE challenge_id = $1
          AND purpose = 'enroll'
          AND session_id IS NULL
          AND consumed_at IS NULL
          AND expires_at > NOW()
       RETURNING nonce, expires_at`,
      [challengeId]
    );

    if (result.rowCount !== 1) return null;
    return {
      nonce: result.rows[0]!.nonce,
      expiresAt: result.rows[0]!.expires_at
    };
  }
}
