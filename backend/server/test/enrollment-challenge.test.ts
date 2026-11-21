import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { EnrollmentChallengeRepository } from "../src/enrollment/challenge-repository.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const repository = new EnrollmentChallengeRepository(pool);

async function cleanupChallenge(challengeId: string): Promise<void> {
  await pool.query("DELETE FROM enrollment_challenges WHERE challenge_id = $1", [challengeId]);
}

test("issues a 32-byte nonce and a short-lived opaque enrollment challenge", async () => {
  const challenge = await repository.issueEnrollmentChallenge();
  try {
    assert.match(challenge.challengeId, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(Buffer.from(challenge.nonce, "base64url").length, 32);
    assert.equal(challenge.expiresInSeconds, 120);
    const row = await pool.query(
      "SELECT purpose, session_id, consumed_at FROM enrollment_challenges WHERE challenge_id = $1",
      [challenge.challengeId]
    );
    assert.equal(row.rows[0].purpose, "enroll");
    assert.equal(row.rows[0].session_id, null);
    assert.equal(row.rows[0].consumed_at, null);
  } finally {
    await cleanupChallenge(challenge.challengeId);
  }
});

test("enrollment challenge can be consumed only once", async () => {
  const challenge = await repository.issueEnrollmentChallenge();
  try {
    const consumed = await repository.consumeEnrollmentChallenge(challenge.challengeId);
    assert.ok(consumed);
    assert.equal(consumed.nonce.toString("base64url"), challenge.nonce);
    assert.equal(await repository.consumeEnrollmentChallenge(challenge.challengeId), null);
  } finally {
    await cleanupChallenge(challenge.challengeId);
  }
});

test("concurrent enrollment challenge consumption has exactly one winner", async () => {
  const challenge = await repository.issueEnrollmentChallenge();
  try {
    const results = await Promise.all([
      repository.consumeEnrollmentChallenge(challenge.challengeId),
      repository.consumeEnrollmentChallenge(challenge.challengeId)
    ]);
    assert.equal(results.filter(Boolean).length, 1);
  } finally {
    await cleanupChallenge(challenge.challengeId);
  }
});

test("expired enrollment challenge cannot be consumed", async () => {
  const challenge = await repository.issueEnrollmentChallenge();
  try {
    await pool.query(
      "UPDATE enrollment_challenges SET expires_at = NOW() - INTERVAL '1 second' WHERE challenge_id = $1",
      [challenge.challengeId]
    );
    assert.equal(await repository.consumeEnrollmentChallenge(challenge.challengeId), null);
  } finally {
    await cleanupChallenge(challenge.challengeId);
  }
});

test("rotation challenge cannot be consumed through enrollment path", async () => {
  const sessionId = randomUUID();
  const paddedId = randomBytes(24).toString("base64url");
  try {
    await pool.query(
      `INSERT INTO installation_sessions
         (session_id, public_key_jwk, public_key_thumbprint, status, expires_at)
       VALUES ($1, '{"kty":"EC","crv":"P-256","x":"x","y":"y"}'::jsonb, $2, 'active', NOW() + INTERVAL '1 day')`,
      [sessionId, `challenge-test-${sessionId}`]
    );
    await pool.query(
      `INSERT INTO enrollment_challenges
         (challenge_id, purpose, nonce, session_id, expires_at)
       VALUES ($1, 'rotate', $2, $3, NOW() + INTERVAL '2 minutes')`,
      [paddedId, Buffer.alloc(32, 7), sessionId]
    );
    assert.equal(await repository.consumeEnrollmentChallenge(paddedId), null);
  } finally {
    await pool.query("DELETE FROM enrollment_challenges WHERE challenge_id = $1", [paddedId]);
    await pool.query("DELETE FROM installation_sessions WHERE session_id = $1", [sessionId]);
  }
});

test("invalid challenge ID encoding is rejected before database access", async () => {
  await assert.rejects(
    repository.consumeEnrollmentChallenge("not a valid id"),
    /INVALID_CHALLENGE_ID/
  );
});

test.after(async () => {
  await pool.end();
});
