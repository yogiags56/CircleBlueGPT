import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

const base = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379"
};

test("loads valid configuration with bounded defaults", () => {
  const config = loadConfig(base);
  assert.equal(config.port, 8080);
  assert.equal(config.maxBodyBytes, 1_048_576);
  assert.equal(config.nodeEnv, "test");
});

test("rejects non-PostgreSQL database URL", () => {
  assert.throws(() => loadConfig({ ...base, DATABASE_URL: "http://localhost/db" }), /CONFIG_INVALID_DATABASE_URL_PROTOCOL/);
});

test("rejects invalid port", () => {
  assert.throws(() => loadConfig({ ...base, PORT: "70000" }), /CONFIG_INVALID_PORT/);
});

test("rejects unbounded body configuration", () => {
  assert.throws(() => loadConfig({ ...base, MAX_BODY_BYTES: "999999999" }), /CONFIG_INVALID_MAX_BODY_BYTES/);
});
