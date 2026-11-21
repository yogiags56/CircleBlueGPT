import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

const config: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 8080,
  logLevel: "silent",
  databaseUrl: "postgres://localhost/test",
  redisUrl: "redis://localhost:6379",
  maxBodyBytes: 1024
};

test("liveness reports process health without checking dependencies", async () => {
  const app = buildApp(config, {
    database: async () => { throw new Error("should not be called"); },
    redis: async () => { throw new Error("should not be called"); }
  });
  try {
    const response = await app.inject({ method: "GET", url: "/health/live" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "ok");
  } finally {
    await app.close();
  }
});

test("readiness is 200 only when PostgreSQL and Redis are healthy", async () => {
  const app = buildApp(config, {
    database: async () => true,
    redis: async () => true
  });
  try {
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().checks, { database: true, redis: true });
  } finally {
    await app.close();
  }
});

test("readiness fails closed when a dependency is unavailable", async () => {
  const app = buildApp(config, {
    database: async () => true,
    redis: async () => { throw new Error("offline"); }
  });
  try {
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().status, "not_ready");
    assert.deepEqual(response.json().checks, { database: true, redis: false });
  } finally {
    await app.close();
  }
});


test("malformed JSON is returned as a safe client error", async () => {
  const app = buildApp(config, { database: async () => true, redis: async () => true });
  app.post("/test/body", async () => ({ ok: true }));
  try {
    const response = await app.inject({
      method: "POST",
      url: "/test/body",
      headers: { "content-type": "application/json" },
      payload: "{not-json"
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "INVALID_REQUEST");
    assert.equal(response.json().error.message, "The request is malformed or invalid.");
  } finally {
    await app.close();
  }
});

test("oversized JSON body is rejected with a stable error code", async () => {
  const app = buildApp(config, { database: async () => true, redis: async () => true });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/health/live",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ data: "x".repeat(2048) })
    });
    assert.equal(response.statusCode, 413);
    assert.equal(response.json().error.code, "REQUEST_TOO_LARGE");
  } finally {
    await app.close();
  }
});
