import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import {
  IdempotencyConflictError,
  IdempotencyRepository
} from "../src/idempotency/repository.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const repository = new IdempotencyRepository(pool);

async function createSession(): Promise<string> {
  const sessionId = randomUUID();
  await pool.query(
    `INSERT INTO installation_sessions
       (session_id, public_key_jwk, public_key_thumbprint, status, expires_at)
     VALUES ($1, '{"kty":"EC","crv":"P-256","x":"x","y":"y"}'::jsonb, $2, 'active', NOW() + INTERVAL '1 day')`,
    [sessionId, `test-${sessionId}`]
  );
  return sessionId;
}

async function removeSession(sessionId: string): Promise<void> {
  await pool.query("DELETE FROM request_idempotency WHERE session_id = $1", [sessionId]);
  await pool.query("DELETE FROM session_tokens WHERE session_id = $1", [sessionId]);
  await pool.query("DELETE FROM enrollment_challenges WHERE session_id = $1", [sessionId]);
  await pool.query("DELETE FROM installation_sessions WHERE session_id = $1", [sessionId]);
}

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

test("first request creates an accepted idempotency record", async () => {
  const sessionId = await createSession();
  try {
    const result = await repository.begin(sessionId, "request-1", hash('{"text":"hello"}'));
    assert.deepEqual(result, { kind: "created", state: "accepted", response: null });
  } finally {
    await removeSession(sessionId);
  }
});

test("same key and body is a replay, not a second accepted request", async () => {
  const sessionId = await createSession();
  try {
    const bodyHash = hash('{"text":"same"}');
    const first = await repository.begin(sessionId, "request-2", bodyHash);
    const replay = await repository.begin(sessionId, "request-2", bodyHash);
    assert.equal(first.kind, "created");
    assert.equal(replay.kind, "replay");
    assert.equal(replay.state, "accepted");
  } finally {
    await removeSession(sessionId);
  }
});

test("same key with a different body is rejected as conflict", async () => {
  const sessionId = await createSession();
  try {
    await repository.begin(sessionId, "request-3", hash("body-A"));
    await assert.rejects(
      repository.begin(sessionId, "request-3", hash("body-B")),
      IdempotencyConflictError
    );
  } finally {
    await removeSession(sessionId);
  }
});

test("concurrent duplicate requests create only one idempotency row", async () => {
  const sessionId = await createSession();
  try {
    const bodyHash = hash("concurrent-body");
    const results = await Promise.all([
      repository.begin(sessionId, "request-4", bodyHash),
      repository.begin(sessionId, "request-4", bodyHash)
    ]);
    assert.equal(results.filter(result => result.kind === "created").length, 1);
    assert.equal(results.filter(result => result.kind === "replay").length, 1);
    const count = await pool.query(
      "SELECT COUNT(*)::int AS count FROM request_idempotency WHERE session_id = $1 AND request_id = $2",
      [sessionId, "request-4"]
    );
    assert.equal(count.rows[0].count, 1);
  } finally {
    await removeSession(sessionId);
  }
});

test("request state transitions to running and completed with stored response", async () => {
  const sessionId = await createSession();
  try {
    const bodyHash = hash("response-body");
    await repository.begin(sessionId, "request-5", bodyHash);
    await repository.markRunning(sessionId, "request-5");
    const response = { requestId: "request-5", message: { text: "hello back" } };
    await repository.complete(sessionId, "request-5", response);
    const replay = await repository.begin(sessionId, "request-5", bodyHash);
    assert.equal(replay.kind, "replay");
    assert.equal(replay.state, "completed");
    assert.deepEqual(replay.response, response);
  } finally {
    await removeSession(sessionId);
  }
});

test("invalid state transitions are rejected", async () => {
  const sessionId = await createSession();
  try {
    await repository.begin(sessionId, "request-6", hash("x"));
    await assert.rejects(repository.complete(sessionId, "request-6", { ok: true }), /INVALID_IDEMPOTENCY_TRANSITION/);
  } finally {
    await removeSession(sessionId);
  }
});

test.after(async () => {
  await pool.end();
});
