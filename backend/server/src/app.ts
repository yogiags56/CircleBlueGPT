import { randomUUID } from "node:crypto";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { registerHealthRoutes, type DependencyHealth } from "./health.js";

export interface AppDependencies extends DependencyHealth {}

export function buildApp(config: AppConfig, dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: config.maxBodyBytes,
    disableRequestLogging: true,
    trustProxy: false,
    requestIdHeader: false,
    genReqId: () => randomUUID()
  });

  registerHealthRoutes(app, dependencies);

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.statusCode === 413) {
      return reply.code(413).send({
        error: { code: "REQUEST_TOO_LARGE", message: "Request body exceeds the configured limit." }
      });
    }
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: { code: "INVALID_REQUEST", message: "The request is malformed or invalid." }
      });
    }
    app.log.error({ err: error }, "Unhandled request error");
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "The request could not be completed." }
    });
  });

  return app;
}
