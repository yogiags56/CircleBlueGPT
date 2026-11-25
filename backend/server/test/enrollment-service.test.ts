import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { EnrollmentService } from "../src/enrollment/enrollment-service.js";
import { p256JwkThumbprint } from "../src/security/p256-jwk.js";

function fixture() {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const exported = pair.publicKey.export({ format: "jwk" });
  const publicKeyJwk = {
    kty: "EC" as const, crv: "P-256" as const,
    x: exported.x!, y: exported.y!
  };
  const challengeId = "A".repeat(32);
  const nonce = Buffer.alloc(32, 9);
  const thumbprint = p256JwkThumbprint(publicKeyJwk);
  const canonical = [
    "CORTANAGPT-ENROLL-V1", "POST", "/v1/enroll",
    challengeId, nonce.toString("base64url"), thumbprint
  ].join("\n");
  const signature = sign("sha256", Buffer.from(canonical), {
    key: pair.privateKey, dsaEncoding: "der"
  }).toString("base64url");
  return { publicKeyJwk, challengeId, nonce, signature, thumbprint };
}

test("enrolls a new installation only after a valid one-time P-256 proof", async () => {
  const f = fixture();
  let consumed = 0;
  let created: unknown[] | undefined;
  const service = new EnrollmentService(
    { async consumeEnrollmentChallenge(id) {
      assert.equal(id, f.challengeId);
      consumed++;
      return { nonce: f.nonce, expiresAt: new Date(Date.now() + 60_000) };
    } },
    { async createEnrolledSession(...args: unknown[]) {
      created = args;
      return {
        sessionId: "00000000-0000-4000-8000-000000000001",
        token: {
          tokenId: "00000000-0000-4000-8000-000000000002",
          accessToken: "A".repeat(43),
          tokenType: "CortanaPoP" as const,
          expiresAt: new Date(Date.now() + 900_000),
          scopes: ["chat:send", "session:revoke"] as ("chat:send" | "session:revoke")[]
        }
      };
    } }
  );
  const result = await service.enroll({
    challengeId: f.challengeId, publicKeyJwk: f.publicKeyJwk, signature: f.signature
  });
  assert.equal(consumed, 1);
  assert.equal(result.sessionId, "00000000-0000-4000-8000-000000000001");
  assert.equal(created?.[1], f.thumbprint);
  assert.deepEqual(created?.[2], ["chat:send", "session:revoke"]);
});

test("consumes challenge and refuses an invalid signature without creating a session", async () => {
  const f = fixture();
  let consumed = 0;
  let created = false;
  const service = new EnrollmentService(
    { async consumeEnrollmentChallenge() {
      consumed++;
      return { nonce: f.nonce, expiresAt: new Date(Date.now() + 60_000) };
    } },
    { async createEnrolledSession() {
      created = true;
      throw new Error("must not be called");
    } }
  );
  await assert.rejects(
    service.enroll({ challengeId: f.challengeId, publicKeyJwk: f.publicKeyJwk, signature: "A".repeat(86) }),
    /ENROLLMENT_PROOF_INVALID/
  );
  assert.equal(consumed, 1);
  assert.equal(created, false);
});

test("does not create a session when challenge is absent, expired, or already consumed", async () => {
  let created = false;
  const service = new EnrollmentService(
    { async consumeEnrollmentChallenge() { return null; } },
    { async createEnrolledSession() { created = true; throw new Error("must not be called"); } }
  );
  await assert.rejects(
    service.enroll({ challengeId: "A".repeat(32), publicKeyJwk: {}, signature: "x" }),
    /ENROLLMENT_CHALLENGE_INVALID_OR_EXPIRED/
  );
  assert.equal(created, false);
});

test("rejects private key material and malformed enrollment payloads", async () => {
  const f = fixture();
  const service = new EnrollmentService(
    { async consumeEnrollmentChallenge() {
      return { nonce: f.nonce, expiresAt: new Date(Date.now() + 60_000) };
    } },
    { async createEnrolledSession() { throw new Error("must not be called"); } }
  );
  await assert.rejects(
    service.enroll({
      challengeId: f.challengeId,
      publicKeyJwk: { ...f.publicKeyJwk, d: "private" },
      signature: f.signature
    }),
    /INVALID_PUBLIC_KEY/
  );
  await assert.rejects(service.enroll(null as never), /INVALID_ENROLLMENT_PROOF/);
});
