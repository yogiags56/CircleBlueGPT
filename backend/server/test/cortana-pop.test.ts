import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { verifyCortanaPopProof } from "../src/security/cortana-pop.js";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = publicKey.export({ format: "jwk" });
const publicJwk = { kty: "EC" as const, crv: "P-256" as const, x: jwk.x!, y: jwk.y! };
const accessToken = randomBytes(32).toString("base64url");
const body = Buffer.from('{"text":"hello"}', "utf8");
const timestamp = "1795392000";
const proofJti = randomBytes(18).toString("base64url");

function signed(overrides: Partial<{
  method: string; pathAndQuery: string; body: Buffer; timestamp: string;
  proofJti: string; accessToken: string;
}> = {}) {
  const values = {
    method: "POST",
    pathAndQuery: "/v1/chat/completions?mode=text",
    body,
    timestamp,
    proofJti,
    accessToken,
    ...overrides
  };
  const bodyHash = (awaitHash(values.body));
  const tokenHash = (awaitTokenHash(values.accessToken));
  const canonical = [
    "CORTANAGPT-POP-V1", values.method, values.pathAndQuery,
    bodyHash, values.timestamp, values.proofJti, tokenHash
  ].join("\n");
  const signature = sign("sha256", Buffer.from(canonical), {
    key: privateKey, dsaEncoding: "der"
  }).toString("base64url");
  return {
    ...values, signature, publicKey: publicJwk,
    nowSeconds: Number(timestamp), clockSkewSeconds: 60
  };
}

function awaitHash(value: Buffer): string {
  return createHash("sha256").update(value).digest("base64url");
}
function awaitTokenHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

test("accepts a valid proof bound to method, target, raw body, timestamp and token", () => {
  const result = verifyCortanaPopProof(signed());
  assert.equal(result.valid, true);
});

test("rejects a changed request body", () => {
  const result = verifyCortanaPopProof({ ...signed(), body: Buffer.from('{"text":"tampered"}') });
  assert.deepEqual(result, { valid: false, reason: "INVALID_SIGNATURE" });
});

test("rejects a changed method or path", () => {
  assert.equal(verifyCortanaPopProof({ ...signed(), method: "GET" }).valid, false);
  assert.equal(verifyCortanaPopProof({ ...signed(), pathAndQuery: "/v1/other" }).valid, false);
});

test("rejects stale timestamps and malformed proof identifiers", () => {
  assert.deepEqual(
    verifyCortanaPopProof({ ...signed(), nowSeconds: Number(timestamp) + 61 }),
    { valid: false, reason: "TIMESTAMP_OUT_OF_WINDOW" }
  );
  assert.deepEqual(
    verifyCortanaPopProof({ ...signed(), proofJti: "short" }),
    { valid: false, reason: "INVALID_PROOF_ID" }
  );
});

test("rejects a different access token", () => {
  const result = verifyCortanaPopProof({ ...signed(), accessToken: randomBytes(32).toString("base64url") });
  assert.deepEqual(result, { valid: false, reason: "INVALID_SIGNATURE" });
});

test("rejects invalid targets before signature verification", () => {
  assert.deepEqual(
    verifyCortanaPopProof({ ...signed(), pathAndQuery: "https://example.com/v1/chat" }),
    { valid: false, reason: "INVALID_TARGET" }
  );
});
