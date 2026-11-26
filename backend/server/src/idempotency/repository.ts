import { timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export type IdempotencyState = "accepted" | "running" | "completed" | "failed" | "cancelled";

export interface IdempotencyBeginResult {
  kind: "created" | "replay";
  state: IdempotencyState;
  response: unknown | null;
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super("IDEMPOTENCY_CONFLICT");
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyRepository {
  constructor(private readonly pool: Pool) {}

  async begin(
    sessionId: string,
    requestId: string,
    bodySha256Hex: string
  ): Promise<IdempotencyBeginResult> {
    if (!requestId || requestId.length > 128) throw new Error("INVALID_REQUEST_ID");
    if (!/^[a-f0-9]{64}$/.test(bodySha256Hex)) throw new Error("INVALID_BODY_SHA256");
    const digest = Buffer.from(bodySha256Hex, "hex");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ state: IdempotencyState; response_json: unknown | null }>(
        `INSERT INTO request_idempotency
           (session_id, request_id, body_sha256, state)
         VALUES ($1, $2, $3, 'accepted')
         ON CONFLICT (session_id, request_id) DO NOTHING
         RETURNING state, response_json`,
        [sessionId, requestId, digest]
      );

      if (inserted.rowCount === 1) {
        await client.query("COMMIT");
        return { kind: "created", state: inserted.rows[0]!.state, response: null };
      }

      const existing = await client.query<{
        body_sha256: Buffer;
        state: IdempotencyState;
        response_json: unknown | null;
      }>(
        `SELECT body_sha256, state, response_json
           FROM request_idempotency
          WHERE session_id = $1 AND request_id = $2
          FOR UPDATE`,
        [sessionId, requestId]
      );

      if (existing.rowCount !== 1) throw new Error("IDEMPOTENCY_ROW_DISAPPEARED");
      const storedDigest = existing.rows[0]!.body_sha256;
      if (storedDigest.length !== digest.length || !timingSafeEqual(storedDigest, digest)) {
        throw new IdempotencyConflictError();
      }

      const row = existing.rows[0]!;
      await client.query("COMMIT");
      return { kind: "replay", state: row.state, response: row.response_json };
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async markRunning(sessionId: string, requestId: string): Promise<void> {
    await this.transition(
      sessionId,
      requestId,
      "UPDATE request_idempotency SET state = $3, updated_at = NOW() WHERE session_id = $1 AND request_id = $2 AND state = $4",
      ["running", "accepted"]
    );
  }

  async complete(sessionId: string, requestId: string, response: unknown): Promise<void> {
    await this.transition(
      sessionId,
      requestId,
      "UPDATE request_idempotency SET state = $3, response_json = $4::jsonb, updated_at = NOW() WHERE session_id = $1 AND request_id = $2 AND state = $5",
      ["completed", JSON.stringify(response), "running"]
    );
  }

  async fail(sessionId: string, requestId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE request_idempotency
          SET state = 'failed', updated_at = NOW()
        WHERE session_id = $1 AND request_id = $2
          AND state IN ('accepted', 'running')`,
      [sessionId, requestId]
    );
    if (result.rowCount !== 1) throw new Error("INVALID_IDEMPOTENCY_TRANSITION");
  }

  private async transition(
    sessionId: string,
    requestId: string,
    sql: string,
    values: unknown[]
  ): Promise<void> {
    const result = await this.pool.query(sql, [sessionId, requestId, ...values]);
    if (result.rowCount !== 1) throw new Error("INVALID_IDEMPOTENCY_TRANSITION");
  }
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original operation error.
  }
}
