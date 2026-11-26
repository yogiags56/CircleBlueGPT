import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { ChatRateLimitStore } from "../src/security/chat-rate-limit-store.js";

const redis = new Redis(process.env.REDIS_URL!, {
  lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false
});
const store = new ChatRateLimitStore(redis);

test.before(async () => { await redis.connect(); });

test("allows requests up to the configured per-session fixed-window limit", async () => {
  const sessionId = "rate-test-" + randomUUID();
  const first = await store.consume(sessionId, 2, 60);
  const second = await store.consume(sessionId, 2, 60);
  const third = await store.consume(sessionId, 2, 60);
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.ok(third.resetAfterSeconds >= 1 && third.resetAfterSeconds <= 60);
});

test("rate counters are isolated per installation session", async () => {
  const suffix = randomUUID();
  const a = await store.consume("rate-A-" + suffix, 1, 60);
  const b = await store.consume("rate-B-" + suffix, 1, 60);
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true);
});

test("concurrent requests cannot exceed the fixed-window allowance", async () => {
  const sessionId = "rate-concurrent-" + randomUUID();
  const results = await Promise.all(
    Array.from({ length: 20 }, () => store.consume(sessionId, 5, 60))
  );
  assert.equal(results.filter(result => result.allowed).length, 5);
  assert.equal(results.filter(result => !result.allowed).length, 15);
});

test("rejects invalid rate policies before Redis access", async () => {
  await assert.rejects(store.consume("session", 0, 60), /INVALID_RATE_LIMIT/);
  await assert.rejects(store.consume("session", 10001, 60), /INVALID_RATE_LIMIT/);
  await assert.rejects(store.consume("session", 10, 0), /INVALID_RATE_WINDOW/);
  await assert.rejects(store.consume("session", 10, 86401), /INVALID_RATE_WINDOW/);
});

test.after(async () => { await redis.quit(); });
