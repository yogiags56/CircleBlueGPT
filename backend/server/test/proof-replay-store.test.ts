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
  const sessionId = `session-${crypto.randomUUID()}`;
  const jti = `proof-${crypto.randomUUID()}`;
  assert.equal(await store.claim(sessionId, jti, 300), true);
  assert.equal(await store.claim(sessionId, jti, 300), false);
});

test("proof identifiers are isolated between sessions", async () => {
  const jti = `shared-proof-${crypto.randomUUID()}`;
  assert.equal(await store.claim("session-A", jti, 300), true);
  assert.equal(await store.claim("session-B", jti, 300), true);
});

test("invalid proof replay retention is rejected", async () => {
  await assert.rejects(store.claim("session", "proof", 0), /INVALID_REPLAY_TTL/);
  await assert.rejects(store.claim("session", "proof", 3601), /INVALID_REPLAY_TTL/);
});

test.after(async () => {
  await redis.quit();
});
