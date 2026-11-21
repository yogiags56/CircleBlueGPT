import { randomUUID } from "node:crypto";
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import { ProofReplayStore } from "../src/security/proof-replay-store.js";

const redis = new Redis(process.env.REDIS_URL!, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false
});
const store = new ProofReplayStore(redis);

test.before(async () => {
  await redis.connect();
});

test("first proof identifier is claimed and duplicate is rejected", async () => {
  const sessionId = `session-${randomUUID()}`;
  const jti = `proof-${randomUUID()}`;
  assert.equal(await store.claim(sessionId, jti, 300), true);
  assert.equal(await store.claim(sessionId, jti, 300), false);
});

test("proof identifiers are isolated between sessions", async () => {
  const jti = `shared-proof-${randomUUID()}`;
  assert.equal(await store.claim("session-A", jti, 300), true);
  assert.equal(await store.claim("session-B", jti, 300), true);
});

test("concurrent duplicate proof IDs have exactly one Redis claim winner", async () => {
  const sessionId = "concurrent-session-" + randomUUID();
  const jti = "concurrent-proof-" + randomUUID();
  const results = await Promise.all(
    Array.from({ length: 12 }, () => store.claim(sessionId, jti, 300))
  );
  assert.equal(results.filter(Boolean).length, 1);
});

test("invalid proof replay retention is rejected", async () => {
  await assert.rejects(store.claim("session", "proof", 0), /INVALID_REPLAY_TTL/);
  await assert.rejects(store.claim("session", "proof", 3601), /INVALID_REPLAY_TTL/);
});

test.after(async () => {
  await redis.quit();
});
