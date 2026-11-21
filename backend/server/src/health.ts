import type { FastifyInstance } from "fastify";

export interface DependencyHealth {
  database: () => Promise<boolean>;
  redis: () => Promise<boolean>;
}

export function registerHealthRoutes(app: FastifyInstance, dependencies: DependencyHealth): void {
  app.get("/health/live", async () => ({
    status: "ok",
    service: "cortanagpt-backend"
  }));

  app.get("/health/ready", async (_request, reply) => {
    const [database, redis] = await Promise.allSettled([
      dependencies.database(),
      dependencies.redis()
    ]);
    const checks = {
      database: database.status === "fulfilled" && database.value,
      redis: redis.status === "fulfilled" && redis.value
    };
    const ready = checks.database && checks.redis;
    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "not_ready",
      checks
    });
  });
}
