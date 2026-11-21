import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import Redis from "ioredis";

test("PostgreSQL migration creates the expected core tables", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(`
      SELECT
        to_regclass('public.installation_sessions') AS sessions,
        to_regclass('public.enrollment_challenges') AS challenges,
        to_regclass('public.session_tokens') AS tokens,
        to_regclass('public.request_idempotency') AS idempotency,
        to_regclass('public.schema_migrations') AS migrations
    `);
    const row = result.rows[0] as Record<string, string | null>;
    for (const table of ["sessions", "challenges", "tokens", "idempotency", "migrations"]) {
      assert.ok(row[table], `expected table ${table} to exist`);
    }
  } finally {
    await pool.end();
  }
});

test("Redis integration responds to PING", async () => {
  const redis = new Redis(process.env.REDIS_URL!, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });
  try {
    await redis.connect();
    assert.equal(await redis.ping(), "PONG");
  } finally {
    await redis.quit();
  }
});
