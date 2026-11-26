import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { Pool } from "pg";
import { EnrollmentChallengeRepository } from "../src/enrollment/challenge-repository.js";
import { EnrollmentService } from "../src/enrollment/enrollment-service.js";
import { p256JwkThumbprint } from "../src/security/p256-jwk.js";
import { SessionTokenRepository } from "../src/session/token-repository.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const challenges = new EnrollmentChallengeRepository(pool);
const sessions = new SessionTokenRepository(pool);
const service = new EnrollmentService(challenges, sessions);

test("real PostgreSQL enrollment consumes challenge, verifies P-256 proof, and creates bound session/token", async () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const exported = pair.publicKey.export({ format: "jwk" });
  const publicKeyJwk = {
    kty: "EC" as const, crv: "P-256" as const,
    x: exported.x!, y: exported.y!
  };
  const challenge = await challenges.issueEnrollmentChallenge(120);
  let enrolled: Awaited<ReturnType<typeof service.enroll>> | undefined;
  try {
    const thumbprint = p256JwkThumbprint(publicKeyJwk);
    const canonical = [
      "CORTANAGPT-ENROLL-V1", "POST", "/v1/enroll",
      challenge.challengeId, challenge.nonce, thumbprint
    ].join("\n");
    const signature = sign("sha256", Buffer.from(canonical), {
      key: pair.privateKey, dsaEncoding: "der"
    }).toString("base64url");

    enrolled = await service.enroll({
      challengeId: challenge.challengeId, publicKeyJwk, signature
    });
    assert.match(enrolled.sessionId, /^[0-9a-f-]{36}$/i);
    assert.match(enrolled.token.accessToken, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(enrolled.token.scopes, ["chat:send", "session:revoke"]);

    const authenticated = await sessions.authenticate(enrolled.token.accessToken);
    assert.ok(authenticated);
    assert.equal(authenticated.sessionId, enrolled.sessionId);
    assert.equal(authenticated.publicKeyThumbprint, thumbprint);
    assert.deepEqual(authenticated.publicKeyJwk, publicKeyJwk);

    const stored = await pool.query(
      "SELECT COUNT(*)::int AS count FROM session_tokens WHERE session_id = $1",
      [enrolled.sessionId]
    );
    assert.equal(stored.rows[0].count, 1);
    await assert.rejects(
      service.enroll({ challengeId: challenge.challengeId, publicKeyJwk, signature }),
      /ENROLLMENT_CHALLENGE_INVALID_OR_EXPIRED/
    );
  } finally {
    if (enrolled) {
      await pool.query("DELETE FROM session_tokens WHERE session_id = $1", [enrolled.sessionId]);
      await pool.query("DELETE FROM installation_sessions WHERE session_id = $1", [enrolled.sessionId]);
    }
    await pool.query("DELETE FROM enrollment_challenges WHERE challenge_id = $1", [challenge.challengeId]);
  }
});

test("a duplicate active public-key identity cannot create a second installation", async () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const exported = pair.publicKey.export({ format: "jwk" });
  const publicKeyJwk = {
    kty: "EC" as const, crv: "P-256" as const,
    x: exported.x!, y: exported.y!
  };
  const firstChallenge = await challenges.issueEnrollmentChallenge();
  const secondChallenge = await challenges.issueEnrollmentChallenge();
  let first: Awaited<ReturnType<typeof service.enroll>> | undefined;
  try {
    const thumbprint = p256JwkThumbprint(publicKeyJwk);
    const makeProof = (challengeId: string, nonce: string) => {
      const canonical = [
        "CORTANAGPT-ENROLL-V1", "POST", "/v1/enroll",
        challengeId, nonce, thumbprint
      ].join("\n");
      return sign("sha256", Buffer.from(canonical), {
        key: pair.privateKey, dsaEncoding: "der"
      }).toString("base64url");
    };
    first = await service.enroll({
      challengeId: firstChallenge.challengeId, publicKeyJwk,
      signature: makeProof(firstChallenge.challengeId, firstChallenge.nonce)
    });
    await assert.rejects(
      service.enroll({
        challengeId: secondChallenge.challengeId, publicKeyJwk,
        signature: makeProof(secondChallenge.challengeId, secondChallenge.nonce)
      })
    );
  } finally {
    if (first) {
      await pool.query("DELETE FROM session_tokens WHERE session_id = $1", [first.sessionId]);
      await pool.query("DELETE FROM installation_sessions WHERE session_id = $1", [first.sessionId]);
    }
    await pool.query("DELETE FROM enrollment_challenges WHERE challenge_id = ANY($1::text[])", [
      [firstChallenge.challengeId, secondChallenge.challengeId]
    ]);
  }
});

test.after(async () => { await pool.end(); });
