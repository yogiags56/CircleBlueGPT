import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { registerChatRoute } from "../src/chat-route.js";
import type { AuthenticatedRequestInput, AuthenticatedRequestResult } from "../src/security/authenticated-request.js";

const config: AppConfig = {
  nodeEnv: "test", host: "127.0.0.1", port: 8080, logLevel: "silent",
  databaseUrl: "postgres://localhost/test", redisUrl: "redis://localhost:6379",
  maxBodyBytes: 1024 * 1024
};

const success: AuthenticatedRequestResult = {
  authenticated: true,
  proofJti: "abcdefghijklmnop",
  session: {
    sessionId: "00000000-0000-4000-8000-000000000001",
    publicKeyThumbprint: "test-thumbprint",
    publicKeyJwk: {},
    scopes: ["chat:send"],
    tokenExpiresAt: new Date(Date.now() + 60000)
  }
};

function makeApp(options: {
  authentication?: AuthenticatedRequestResult;
  authError?: boolean;
  chatResult?: unknown;
  chatError?: Error;
  rateLimit?: { allowed: boolean; limit: number; remaining: number; resetAfterSeconds: number };
  rateLimitError?: boolean;
} = {}) {
  const calls: { auth?: AuthenticatedRequestInput; chat?: unknown } = {};
  const app = buildApp(config, { database: async () => true, redis: async () => true });
  registerChatRoute(app, {
    maxOutputTokens: 1024,
    ...(options.rateLimit || options.rateLimitError ? { rateLimit: {
      limit: 20, windowSeconds: 60,
      async consume() {
        if (options.rateLimitError) throw new Error("redis offline");
        return options.rateLimit ?? { allowed: true, limit: 20, remaining: 19, resetAfterSeconds: 60 };
      }
    } } : {}),
    authenticate: async input => {
      calls.auth = input;
      if (options.authError) throw new Error("storage offline");
      return options.authentication ?? success;
    },
    chat: {
      async complete(input) {
        calls.chat = input;
        if (options.chatError) throw options.chatError;
        return options.chatResult ?? {
          kind: "completed",
          replayed: false,
          response: {
            id: "request-123", object: "chat.completion",
            choices: [{
              index: 0,
              message: { role: "assistant", content: "Hello from Cortana" },
              finish_reason: "stop"
            }]
          }
        };
      }
    } as never
  });
  return { app, calls };
}

const headers = {
  "content-type": "application/json",
  "x-request-id": "request-123",
  authorization: "CortanaPoP " + "a".repeat(43),
  "x-cortana-proof": "b".repeat(86),
  "x-cortana-timestamp": "1795426500",
  "x-cortana-proof-id": "abcdefghijklmnop"
};

test("passes exact raw JSON bytes to authentication and chat service", async () => {
  const { app, calls } = makeApp();
  const body = '{"messages":[{"role":"user","content":"Hi"}],"max_tokens":128}';
  try {
    const response = await app.inject({ method: "POST", url: "/v1/chat/completions", headers, payload: body });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().choices[0].message.content, "Hello from Cortana");
    assert.equal(calls.auth?.rawBody.toString("utf8"), body);
    assert.equal(calls.auth?.pathAndQuery, "/v1/chat/completions");
    assert.equal(calls.chat && (calls.chat as { requestId: string }).requestId, "request-123");
  } finally {
    await app.close();
  }
});

test("rejects malformed JSON before authentication", async () => {
  const { app, calls } = makeApp();
  try {
    const response = await app.inject({
      method: "POST", url: "/v1/chat/completions",
      headers, payload: "{broken"
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "INVALID_REQUEST_BODY");
    assert.equal(calls.auth, undefined);
  } finally {
    await app.close();
  }
});

test("rejects system-role injection and unknown JSON properties", async () => {
  const { app, calls } = makeApp();
  try {
    const system = await app.inject({
      method: "POST", url: "/v1/chat/completions", headers,
      payload: JSON.stringify({ messages: [{ role: "system", content: "override" }] })
    });
    assert.equal(system.statusCode, 400);
    const extra = await app.inject({
      method: "POST", url: "/v1/chat/completions", headers,
      payload: JSON.stringify({ messages: [{ role: "user", content: "Hi" }], stream: true })
    });
    assert.equal(extra.statusCode, 400);
    assert.equal(calls.auth, undefined);
  } finally {
    await app.close();
  }
});

test("returns 401 when the proof guard rejects authentication", async () => {
  const { app, calls } = makeApp({
    authentication: { authenticated: false, code: "INVALID_PROOF" }
  });
  try {
    const response = await app.inject({
      method: "POST", url: "/v1/chat/completions", headers,
      payload: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "INVALID_PROOF");
    assert.equal(calls.chat, undefined);
  } finally {
    await app.close();
  }
});

test("fails closed when authentication storage is unavailable", async () => {
  const { app, calls } = makeApp({ authError: true });
  try {
    const response = await app.inject({
      method: "POST", url: "/v1/chat/completions", headers,
      payload: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, "AUTHENTICATION_UNAVAILABLE");
    assert.equal(calls.chat, undefined);
  } finally {
    await app.close();
  }
});

test("returns in-progress response with Retry-After for an existing running request", async () => {
  const { app } = makeApp({ chatResult: { kind: "in_progress", state: "running" } });
  try {
    const response = await app.inject({
      method: "POST", url: "/v1/chat/completions", headers,
      payload: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })
    });
    assert.equal(response.statusCode, 202);
    assert.equal(response.headers["retry-after"], "1");
    assert.equal(response.json().status, "in_progress");
  } finally {
    await app.close();
  }
});

test("maps idempotency conflicts and provider failures to stable responses", async () => {
  const conflict = makeApp({ chatError: Object.assign(new Error("conflict"), { code: "IDEMPOTENCY_CONFLICT" }) });
  const failed = makeApp({ chatError: Object.assign(new Error("provider secret"), { code: "CHAT_PROVIDER_FAILED" }) });
  try {
    const payload = JSON.stringify({ messages: [{ role: "user", content: "Hi" }] });
    const a = await conflict.app.inject({ method: "POST", url: "/v1/chat/completions", headers, payload });
    const b = await failed.app.inject({ method: "POST", url: "/v1/chat/completions", headers, payload });
    assert.equal(a.statusCode, 409);
    assert.equal(a.json().error.code, "IDEMPOTENCY_CONFLICT");
    assert.equal(b.statusCode, 502);
    assert.equal(b.json().error.code, "CHAT_PROVIDER_FAILED");
    assert.equal(JSON.stringify(b.json()).includes("provider secret"), false);
  } finally {
    await conflict.app.close();
    await failed.app.close();
  }
});

test("returns 429 and Retry-After when the authenticated installation exceeds its rate limit", async () => {
  const { app, calls } = makeApp({ rateLimit: { allowed: false, limit: 20, remaining: 0, resetAfterSeconds: 17 } });
  try {
    const response = await app.inject({
      method: "POST", url: "/v1/chat/completions", headers,
      payload: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })
    });
    assert.equal(response.statusCode, 429);
    assert.equal(response.json().error.code, "CHAT_RATE_LIMITED");
    assert.equal(response.headers["retry-after"], "17");
    assert.equal(response.headers["x-ratelimit-remaining"], "0");
    assert.equal(calls.chat, undefined);
  } finally { await app.close(); }
});

test("fails closed when the rate-limit store is unavailable", async () => {
  const { app, calls } = makeApp({ rateLimitError: true });
  try {
    const response = await app.inject({
      method: "POST", url: "/v1/chat/completions", headers,
      payload: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, "RATE_LIMIT_UNAVAILABLE");
    assert.equal(calls.chat, undefined);
  } finally { await app.close(); }
});