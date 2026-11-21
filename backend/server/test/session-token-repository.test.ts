import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { SessionTokenRepository } from "../src/session/token-repository.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const repository = new SessionTokenRepository(pool);

async function createSession(expires = "1 day"): Promise<string> {
  const sessionId = randomUUID();
  await pool.query(
    `INSERT INTO installation_sessions
       (session_id, public_key_jwk, public_key_thumbprint, status, expires_at)
     VALUES ($1, '{"kty":"EC","crv":"P-256","x":"x","y":"y"}'::jsonb, $2, 'active', NOW() + $3::interval)`,
    [sessionId, `token-test-${sessionId}`, expires]
  );
  return sessionId;
}

async function cleanupSession(sessionId: string): Promise<void> {
  await pool.query("DELETE FROM request_idempotency WHERE session_id = $1", [sessionId]);
  await pool.query("DELETE FROM session_tokens WHERE session_id = $1", [sessionId]);
  await pool.query("DELETE FROM enrollment_challenges WHERE session_id = $1", [sessionId]);
  await pool.query("DELETE FROM installation_sessions WHERE session_id = $1", [sessionId]);
}

test("issues opaque access token and stores only its SHA-256 hash", async () => {
  const sessionId = await createSession();
  try {
    const issued = await repository.issueInitial(sessionId);
    assert.match(issued.accessToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(issued.tokenType, "DPoP");
    assert.deepEqual(issued.scopes, ["chat:send", "session:revoke"]);
    const stored = await pool.query(
      "SELECT token_hash, expires_at FROM session_tokens WHERE token_id = $1",
      [issued.tokenId]
    );
    assert.equal(stored.rowCount, 1);
    assert.deepEqual(stored.rows[0].token_hash, createHash("sha256").update(issued.accessToken).digest());
    assert.equal(stored.rows[0].token_hash.includes(Buffer.from(issued.accessToken)), false);
    assert.ok(new Date(stored.rows[0].expires_at).getTime() <= issued.expiresAt.getTime() + 1000);
  } finally {
    await cleanupSession(sessionId);
  }
});

test("authenticates only an active unexpired token and returns its bound session key", async () => {
  const sessionId = await createSession();
  try {
    const issued = await repository.issueInitial(sessionId, ["chat:send"], 300);
    const authenticated = await repository.authenticate(issued.accessToken);
    assert.ok(authenticated);
    assert.equal(authenticated.sessionId, sessionId);
    assert.equal(authenticated.publicKeyThumbprint, `token-test-${sessionId}`);
    assert.deepEqual(authenticated.scopes, ["chat:send"]);
    assert.equal(await repository.authenticate("not-a-token"), null);
    assert.equal(await repository.authenticate(randomUUID()), null);
    await pool.query(
      "UPDATE session_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE token_id = $1",
      [issued.tokenId]
    );
    assert.equal(await repository.authenticate(issued.accessToken), null);
  } finally {
    await cleanupSession(sessionId);
  }
});

test("refuses a second initial token after the first token has been revoked", async () => {
  const sessionId = await createSession();
  try {
    const first = await repository.issueInitial(sessionId);
    await repository.revokeSession(sessionId);
    await assert.rejects(repository.issueInitial(sessionId), /SESSION_TOKEN_ALREADY_ISSUED/);
  } finally {
    await cleanupSession(sessionId);
  }
});

test("rotation revokes old token and makes only replacement token valid", async () => {
  const sessionId = await createSession();
  try {
    const first = await repository.issueInitial(sessionId);
    const second = await repository.rotate(sessionId, first.accessToken);
    assert.notEqual(first.accessToken, second.accessToken);
    assert.equal(await repository.authenticate(first.accessToken), null);
    assert.equal((await repository.authenticate(second.accessToken))?.sessionId, sessionId);
    const rows = await pool.query(
      "SELECT revoked_at FROM session_tokens WHERE session_id = $1 ORDER BY created_at",
      [sessionId]
    );
    assert.equal(rows.rowCount, 2);
    assert.equal(rows.rows.filter(row => row.revoked_at !== null).length, 1);
    assert.equal(rows.rows.filter(row => row.revoked_at === null).length, 1);
  } finally {
    await cleanupSession(sessionId);
  }
});

test("concurrent rotations serialize and leave exactly one usable token", async () => {
  const sessionId = await createSession();
  try {
    const initial = await repository.issueInitial(sessionId);
    const attempts = await Promise.allSettled([
      repository.rotate(sessionId, initial.accessToken),
      repository.rotate(sessionId, initial.accessToken)
    ]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(attempts.filter(result => result.status === "rejected").length, 1);
    const winningToken = attempts.find(result => result.status === "fulfilled");
    assert.ok(winningToken && winningToken.status === "fulfilled");
    assert.equal((await repository.authenticate(winningToken.value.accessToken))?.sessionId, sessionId);
    const rows = await pool.query(
      "SELECT COUNT(*)::int AS count FROM session_tokens WHERE session_id = $1 AND revoked_at IS NULL",
      [sessionId]
    );
    assert.equal(rows.rows[0].count, 1);
  } finally {
    await cleanupSession(sessionId);
  }
});

test("session revocation invalidates every outstanding token", async () => {
  const sessionId = await createSession();
  try {
    const first = await repository.issueInitial(sessionId);
    const second = await repository.rotate(sessionId);
    assert.equal(await repository.revokeSession(sessionId), true);
    assert.equal(await repository.revokeSession(sessionId), false);
    assert.equal(await repository.authenticate(first.accessToken), null);
    assert.equal(await repository.authenticate(second.accessToken), null);
  } finally {
    await cleanupSession(sessionId);
  }
});

test("expired session cannot receive a token and token policy is bounded", async () => {
  const sessionId = await createSession("-1 second");
  try {
    await assert.rejects(repository.issueInitial(sessionId), /SESSION_NOT_ACTIVE/);
  } finally {
    await cleanupSession(sessionId);
  }
  const activeId = await createSession();
  try {
    await assert.rejects(repository.issueInitial(activeId, ["admin"] as never), /INVALID_SESSION_SCOPES/);
    await assert.rejects(repository.issueInitial(activeId, ["chat:send"], 30), /INVALID_SESSION_TOKEN_TTL/);
  } finally {
    await cleanupSession(activeId);
  }
});

test.after(async () => {
  await pool.end();
});
