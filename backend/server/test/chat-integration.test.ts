import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign
} from "node:crypto";
import { Pool } from "pg";
import Redis from "ioredis";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { registerChatRoute } from "../src/chat-route.js";
import { ChatCompletionService } from "../src/chat-service.js";
import { IdempotencyRepository } from "../src/idempotency/repository.js";
import { authenticateCortanaRequest } from "../src/security/authenticated-request.js";
import { p256JwkThumbprint } from "../src/security/p256-jwk.js";
import { ProofReplayStore } from "../src/security/proof-replay-store.js";
import { SessionTokenRepository } from "../src/session/token-repository.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false
});

const appConfig: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 8080,
  logLevel: "silent",
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL!,
  maxBodyBytes: 1024 * 1024
};

test("real PostgreSQL + Redis + CortanaPoP + chat route returns and replays one completion", async () => {
  await redis.connect();
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const exported = publicKey.export({ format: "jwk" });
  const publicJwk = {
    kty: "EC" as const,
    crv: "P-256" as const,
    x: exported.x!,
    y: exported.y!
  };
  const thumbprint = p256JwkThumbprint(publicJwk);
  const sessionId = randomUUID();
  const sessions = new SessionTokenRepository(pool);
  const replay = new ProofReplayStore(redis);
  const idempotency = new IdempotencyRepository(pool);
  let providerCalls = 0;

  await pool.query(
    `INSERT INTO installation_sessions
       (session_id, public_key_jwk, public_key_thumbprint, status, expires_at)
     VALUES ($1, $2::jsonb, $3, 'active', NOW() + INTERVAL '1 day')`,
    [sessionId, JSON.stringify(publicJwk), thumbprint]
  );
  const issued = await sessions.issueInitial(sessionId, ["chat:send"], 900);

  const chat = new ChatCompletionService(idempotency, {
    async complete(input) {
      providerCalls++;
      assert.equal(input.messages[0]?.role, "system");
      assert.equal(input.messages[0]?.content, "Cortana persona integration test");
      return { text: "Hello, I'm Cortana." };
    }
  }, {
    systemInstruction: "Cortana persona integration test",
    maxOutputTokens: 512
  });

  const app = buildApp(appConfig, {
    database: async () => true,
    redis: async () => true
  });
  registerChatRoute(app, {
    authenticate: input => authenticateCortanaRequest(input, sessions, replay),
    chat,
    maxOutputTokens: 512
  });

  function requestHeaders(body: Buffer, requestId: string) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const proofId = randomBytes(18).toString("base64url");
    const bodyHash = createHash("sha256").update(body).digest("base64url");
    const tokenHash = createHash("sha256").update(issued.accessToken, "utf8").digest("base64url");
    const canonical = [
      "CORTANAGPT-POP-V1",
      "POST",
      "/v1/chat/completions",
      bodyHash,
      timestamp,
      proofId,
      tokenHash
    ].join("\n");
    const signature = sign("sha256", Buffer.from(canonical, "utf8"), {
      key: privateKey,
      dsaEncoding: "der"
    }).toString("base64url");
    return {
      "content-type": "application/json",
      "x-request-id": requestId,
      authorization: `CortanaPoP ${issued.accessToken}`,
      "x-cortana-proof": signature,
      "x-cortana-timestamp": timestamp,
      "x-cortana-proof-id": proofId
    };
  }

  try {
    const requestId = `integration-${randomUUID()}`;
    const body = Buffer.from(JSON.stringify({
      messages: [{ role: "user", content: "Hello Cortana" }],
      max_tokens: 128
    }), "utf8");

    const first = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: requestHeaders(body, requestId),
      payload: body
    });
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().choices[0].message.content, "Hello, I'm Cortana.");
    assert.equal(providerCalls, 1);

    // A retry uses a fresh proof ID but the same request ID and exact body.
    const replayed = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: requestHeaders(body, requestId),
      payload: body
    });
    assert.equal(replayed.statusCode, 200, replayed.body);
    assert.equal(replayed.headers["x-idempotent-replay"], "true");
    assert.deepEqual(replayed.json(), first.json());
    assert.equal(providerCalls, 1);

    // Reusing the request ID with a different raw body must conflict.
    const alteredBody = Buffer.from(JSON.stringify({
      messages: [{ role: "user", content: "A different question" }],
      max_tokens: 128
    }), "utf8");
    const conflict = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: requestHeaders(alteredBody, requestId),
      payload: alteredBody
    });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().error.code, "IDEMPOTENCY_CONFLICT");
    assert.equal(providerCalls, 1);

    const stored = await pool.query(
      "SELECT state, response_json FROM request_idempotency WHERE session_id = $1 AND request_id = $2",
      [sessionId, requestId]
    );
    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].state, "completed");
    assert.equal(stored.rows[0].response_json.choices[0].message.content, "Hello, I'm Cortana.");
  } finally {
    await app.close();
    await pool.query("DELETE FROM request_idempotency WHERE session_id = $1", [sessionId]);
    await pool.query("DELETE FROM session_tokens WHERE session_id = $1", [sessionId]);
    await pool.query("DELETE FROM installation_sessions WHERE session_id = $1", [sessionId]);
  }
});

test.after(async () => {
  await Promise.allSettled([pool.end(), redis.quit()]);
});
