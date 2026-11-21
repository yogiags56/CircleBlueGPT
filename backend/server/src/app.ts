import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { registerHealthRoutes, type DependencyHealth } from "./health.js";

export interface AppDependencies extends DependencyHealth {}

export function buildApp(config: AppConfig, dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: config.maxBodyBytes,
    disableRequestLogging: true,
    trustProxy: false
  });

  registerHealthRoutes(app, dependencies);

  app.setErrorHandler((error, _request, reply) => {
    if (error.statusCode === 413) {
      return reply.code(413).send({
        error: { code: "REQUEST_TOO_LARGE", message: "Request body exceeds the configured limit." }
      });
    }
    app.log.error({ err: error }, "Unhandled request error");
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "The request could not be completed." }
    });
  });

  return app;
}
