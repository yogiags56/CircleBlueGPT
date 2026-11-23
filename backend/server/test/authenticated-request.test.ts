import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { authenticateCortanaRequest, type AuthenticatedRequestInput } from "../src/security/authenticated-request.js";
import { p256JwkThumbprint } from "../src/security/p256-jwk.js";
import type { AuthenticatedSession } from "../src/session/token-repository.js";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const exported = publicKey.export({ format: "jwk" });
const publicJwk = { kty: "EC" as const, crv: "P-256" as const, x: exported.x!, y: exported.y! };
const accessToken = randomBytes(32).toString("base64url");
const session: AuthenticatedSession = {
  sessionId: "c4a8e47e-bc7d-4f8d-9a0e-4a5f24b6d97d",
  publicKeyThumbprint: p256JwkThumbprint(publicJwk),
  publicKeyJwk: publicJwk,
  scopes: ["chat:send", "session:revoke"],
  tokenExpiresAt: new Date(Date.now() + 600000)
};

function makeRequest(overrides: Partial<AuthenticatedRequestInput> = {}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const method = "POST";
  const pathAndQuery = "/v1/chat/completions";
  const rawBody = Buffer.from('{"protocolVersion":1,"requestId":"request-1234567890","input":{"text":"Hello"}}');
  const timestamp = String(nowSeconds);
  const proofId = randomBytes(18).toString("base64url");
  const bodyHash = createHash("sha256").update(rawBody).digest("base64url");
  const tokenHash = createHash("sha256").update(accessToken, "utf8").digest("base64url");
  const canonical = [
    "CORTANAGPT-POP-V1", method, pathAndQuery, bodyHash, timestamp, proofId, tokenHash
  ].join("\n");
  const proof = sign("sha256", Buffer.from(canonical), {
    key: privateKey, dsaEncoding: "der"
  }).toString("base64url");
  return {
    method, pathAndQuery, rawBody, requiredScope: "chat:send" as const, nowSeconds,
    headers: {
      authorization: `CortanaPoP ${accessToken}`,
      proof, timestamp, proofId
    },
    ...overrides
  };
}

function dependencies(options: {
  session?: AuthenticatedSession | null;
  claim?: (sessionId: string, proofJti: string, ttlSeconds: number) => Promise<boolean>;
} = {}) {
  const calls: Array<{ sessionId: string; proofJti: string; ttlSeconds: number }> = [];
  const sessions = {
    authenticate: async (token: string) => token === accessToken ? (options.session === undefined ? session : options.session) : null
  };
  const replay = {
    claim: async (sessionId: string, proofJti: string, ttlSeconds: number) => {
      calls.push({ sessionId, proofJti, ttlSeconds });
      return options.claim ? options.claim(sessionId, proofJti, ttlSeconds) : true;
    }
  };
  return { sessions, replay, calls };
}

test("authenticates a correctly signed request and atomically claims its proof ID", async () => {
  const deps = dependencies();
  const result = await authenticateCortanaRequest(makeRequest(), deps.sessions, deps.replay);
  assert.equal(result.authenticated, true);
  assert.equal(deps.calls.length, 1);
  assert.equal(deps.calls[0]!.ttlSeconds, 300);
});

test("rejects missing or malformed authorization before session lookup", async () => {
  const deps = dependencies();
  const missing = await authenticateCortanaRequest(
    makeRequest({ headers: { proof: "x", timestamp: "1", proofId: "1234567890123456" } }),
    deps.sessions, deps.replay
  );
  assert.deepEqual(missing, { authenticated: false, code: "MISSING_AUTHORIZATION" });
  const malformed = await authenticateCortanaRequest(
    makeRequest({ headers: { authorization: `Bearer ${accessToken}` } }),
    deps.sessions, deps.replay
  );
  assert.deepEqual(malformed, { authenticated: false, code: "INVALID_AUTHORIZATION" });
  assert.equal(deps.calls.length, 0);
});

test("rejects absent proof headers and unknown session", async () => {
  const deps = dependencies({ session: null });
  const absent = await authenticateCortanaRequest(
    makeRequest({ headers: { authorization: `CortanaPoP ${accessToken}` } }),
    deps.sessions, deps.replay
  );
  assert.deepEqual(absent, { authenticated: false, code: "INVALID_PROOF_HEADERS" });
  const unknown = await authenticateCortanaRequest(makeRequest(), deps.sessions, deps.replay);
  assert.deepEqual(unknown, { authenticated: false, code: "SESSION_NOT_ACTIVE" });
});

test("rejects key thumbprint mismatch and does not claim replay ID", async () => {
  const deps = dependencies({ session: { ...session, publicKeyThumbprint: "A".repeat(43) } });
  const result = await authenticateCortanaRequest(makeRequest(), deps.sessions, deps.replay);
  assert.deepEqual(result, { authenticated: false, code: "KEY_BINDING_MISMATCH" });
  assert.equal(deps.calls.length, 0);
});

test("rejects changed raw body and does not claim replay ID", async () => {
  const deps = dependencies();
  const request = makeRequest();
  request.rawBody = Buffer.from('{"tampered":true}');
  const result = await authenticateCortanaRequest(request, deps.sessions, deps.replay);
  assert.deepEqual(result, { authenticated: false, code: "INVALID_PROOF" });
  assert.equal(deps.calls.length, 0);
});

test("rejects duplicate proof ID and insufficient scope", async () => {
  const duplicate = dependencies({ claim: async () => false });
  const replayed = await authenticateCortanaRequest(makeRequest(), duplicate.sessions, duplicate.replay);
  assert.deepEqual(replayed, { authenticated: false, code: "PROOF_REPLAYED" });

  const noScope = dependencies({
    session: { ...session, scopes: ["session:revoke"] }
  });
  const denied = await authenticateCortanaRequest(makeRequest(), noScope.sessions, noScope.replay);
  assert.deepEqual(denied, { authenticated: false, code: "INSUFFICIENT_SCOPE" });
});
