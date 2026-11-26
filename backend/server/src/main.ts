import "dotenv/config";
import { Pool } from "pg";
import Redis from "ioredis";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000
  });
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3000
  });

  const app = buildApp(config, {
    database: async () => {
      await database.query("SELECT 1");
      return true;
    },
    redis: async () => {
      if (redis.status === "wait" || redis.status === "end") await redis.connect();
      return (await redis.ping()) === "PONG";
    }
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    await Promise.allSettled([database.end(), redis.quit()]);
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error({ err: error }, "Server startup failed");
    await Promise.allSettled([database.end(), redis.quit()]);
    process.exitCode = 1;
  }
}

void main();
