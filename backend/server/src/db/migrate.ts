import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const migrationVersion = "001_initial_schema";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000
});

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const existing = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1",
      [migrationVersion]
    );

    if (existing.rowCount === 0) {
      const sqlPath = path.resolve(__dirname, "../../db/001_initial_schema.sql");
      const sql = await readFile(sqlPath, "utf8");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [migrationVersion]
      );
      process.stdout.write(`Applied migration ${migrationVersion}\n`);
    } else {
      process.stdout.write(`Migration ${migrationVersion} already applied\n`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

migrate()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown migration error";
    process.stderr.write(`Migration failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
