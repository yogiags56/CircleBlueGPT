import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export const SESSION_SCOPES = ["chat:send", "session:revoke"] as const;
export type SessionScope = typeof SESSION_SCOPES[number];

export interface AuthenticatedSession {
  sessionId: string;
  publicKeyThumbprint: string;
  publicKeyJwk: unknown;
  scopes: SessionScope[];
  tokenExpiresAt: Date;
}

export interface IssuedSessionToken {
  tokenId: string;
  accessToken: string;
  tokenType: "CortanaPoP";
  expiresAt: Date;
  scopes: SessionScope[];
}

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function validateSessionId(sessionId: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("INVALID_SESSION_ID");
}

function validateTokenPolicy(scopes: readonly string[], ttlSeconds: number): SessionScope[] {
  if (!Array.isArray(scopes) || scopes.length === 0 ||
      scopes.some(scope => !SESSION_SCOPES.includes(scope as SessionScope)) ||
      new Set(scopes).size !== scopes.length) {
    throw new Error("INVALID_SESSION_SCOPES");
  }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600) {
    throw new Error("INVALID_SESSION_TOKEN_TTL");
  }
  return [...scopes] as SessionScope[];
}

function tokenDigest(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export class SessionTokenRepository {
  constructor(private readonly pool: Pool) {}

  async issueInitial(
    sessionId: string,
    scopes: readonly string[] = ["chat:send", "session:revoke"],
    ttlSeconds = 900
  ): Promise<IssuedSessionToken> {
    validateSessionId(sessionId);
    const allowedScopes = validateTokenPolicy(scopes, ttlSeconds);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const session = await lockActiveSession(client, sessionId);
      const existing = await client.query(
        "SELECT 1 FROM session_tokens WHERE session_id = $1 LIMIT 1",
        [sessionId]
      );
      if (existing.rowCount) throw new Error("SESSION_TOKEN_ALREADY_ISSUED");
      const issued = await insertToken(client, sessionId, session.expires_at, allowedScopes, ttlSeconds);
      await client.query("COMMIT");
      return issued;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Rotates all outstanding access credentials and issues one replacement atomically. */
  async rotate(
    sessionId: string,
    currentAccessToken: string,
    scopes: readonly string[] = ["chat:send", "session:revoke"],
    ttlSeconds = 900
  ): Promise<IssuedSessionToken> {
    validateSessionId(sessionId);
    if (typeof currentAccessToken !== "string" || !TOKEN_PATTERN.test(currentAccessToken) ||
        Buffer.from(currentAccessToken, "base64url").toString("base64url") !== currentAccessToken) {
      throw new Error("INVALID_CURRENT_SESSION_TOKEN");
    }
    const allowedScopes = validateTokenPolicy(scopes, ttlSeconds);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const session = await lockActiveSession(client, sessionId);
      const current = await client.query(
        `SELECT token_id FROM session_tokens
          WHERE session_id = $1 AND token_hash = $2
            AND revoked_at IS NULL AND expires_at > NOW()
          FOR UPDATE`,
        [sessionId, tokenDigest(currentAccessToken)]
      );
      if (current.rowCount !== 1) throw new Error("CURRENT_SESSION_TOKEN_NOT_ACTIVE");
      await client.query(
        "UPDATE session_tokens SET revoked_at = NOW() WHERE session_id = $1 AND revoked_at IS NULL",
        [sessionId]
      );
      const issued = await insertToken(client, sessionId, session.expires_at, allowedScopes, ttlSeconds);
      await client.query("COMMIT");
      return issued;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Returns null for malformed, unknown, expired or revoked tokens. */
  async authenticate(accessToken: string): Promise<AuthenticatedSession | null> {
    if (typeof accessToken !== "string" || !TOKEN_PATTERN.test(accessToken) ||
        Buffer.from(accessToken, "base64url").toString("base64url") !== accessToken) {
      return null;
    }
    const result = await this.pool.query<{
      session_id: string;
      public_key_thumbprint: string;
      public_key_jwk: unknown;
      scopes: string[];
      token_expires_at: Date;
    }>(
      `SELECT s.session_id, s.public_key_thumbprint, s.public_key_jwk,
              t.scopes, t.expires_at AS token_expires_at
         FROM session_tokens t
         JOIN installation_sessions s ON s.session_id = t.session_id
        WHERE t.token_hash = $1
          AND t.revoked_at IS NULL
          AND t.expires_at > NOW()
          AND s.status = 'active'
          AND s.expires_at > NOW()`,
      [tokenDigest(accessToken)]
    );
    if (result.rowCount !== 1) return null;
    const row = result.rows[0]!;
    return {
      sessionId: row.session_id,
      publicKeyThumbprint: row.public_key_thumbprint,
      publicKeyJwk: row.public_key_jwk,
      scopes: row.scopes as SessionScope[],
      tokenExpiresAt: row.token_expires_at
    };
  }

  /** Revokes the session and all its tokens in one database transaction. */
  async revokeSession(sessionId: string): Promise<boolean> {
    validateSessionId(sessionId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE installation_sessions
            SET status = 'revoked', revoked_at = NOW()
          WHERE session_id = $1 AND status = 'active'`,
        [sessionId]
      );
      if (result.rowCount === 1) {
        await client.query(
          "UPDATE session_tokens SET revoked_at = NOW() WHERE session_id = $1 AND revoked_at IS NULL",
          [sessionId]
        );
      }
      await client.query("COMMIT");
      return result.rowCount === 1;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function lockActiveSession(
  client: PoolClient,
  sessionId: string
): Promise<{ expires_at: Date }> {
  const result = await client.query<{ expires_at: Date }>(
    `SELECT expires_at FROM installation_sessions
      WHERE session_id = $1 AND status = 'active' AND expires_at > NOW()
      FOR UPDATE`,
    [sessionId]
  );
  if (result.rowCount !== 1) throw new Error("SESSION_NOT_ACTIVE");
  return result.rows[0]!;
}

async function insertToken(
  client: PoolClient,
  sessionId: string,
  sessionExpiresAt: Date,
  scopes: SessionScope[],
  ttlSeconds: number
): Promise<IssuedSessionToken> {
  const tokenId = randomUUID();
  const accessToken = randomBytes(32).toString("base64url");
  const result = await client.query<{ expires_at: Date }>(
    `INSERT INTO session_tokens
       (token_id, session_id, token_hash, scopes, expires_at)
     VALUES ($1, $2, $3, $4,
             LEAST(NOW() + ($5 * INTERVAL '1 second'), $6::timestamptz))
     RETURNING expires_at`,
    [tokenId, sessionId, tokenDigest(accessToken), scopes, ttlSeconds, sessionExpiresAt]
  );
  if (result.rowCount !== 1) throw new Error("SESSION_TOKEN_CREATE_FAILED");
  return {
    tokenId,
    accessToken,
    tokenType: "CortanaPoP",
    expiresAt: result.rows[0]!.expires_at,
    scopes
  };
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original operation error.
  }
}
