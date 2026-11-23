import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type Redis from "ioredis";
import { ChatCompletionService } from "./chat-service.js";
import { registerChatRoute } from "./chat-route.js";
import { IdempotencyRepository } from "./idempotency/repository.js";
import { OpenAICompatibleChatProvider } from "./provider/openai-compatible.js";
import { authenticateCortanaRequest } from "./security/authenticated-request.js";
import { ProofReplayStore } from "./security/proof-replay-store.js";
import { SessionTokenRepository } from "./session/token-repository.js";

export interface ChatSubsystemInfrastructure {
  postgres: Pool;
  redis: Redis;
}

export interface ChatSubsystemConfig {
  providerEndpoint: string;
  providerApiKey: string;
  providerModel: string;
  personaSystemInstruction: string;
  maxOutputTokens: number;
  providerTimeoutMs?: number;
}

/**
 * Explicit composition root for the chat route. This is intentionally not
 * called from main.ts: route activation remains a separate reviewed decision.
 */
export function registerChatSubsystem(
  app: FastifyInstance,
  infrastructure: ChatSubsystemInfrastructure,
  config: ChatSubsystemConfig
): void {
  if (typeof config.personaSystemInstruction !== "string" ||
      config.personaSystemInstruction.trim().length === 0 ||
      config.personaSystemInstruction.length > 12000) {
    throw new Error("INVALID_CORTANA_PERSONA_INSTRUCTION");
  }
  if (!Number.isInteger(config.maxOutputTokens) ||
      config.maxOutputTokens < 1 || config.maxOutputTokens > 8192) {
    throw new Error("INVALID_CHAT_OUTPUT_TOKEN_LIMIT");
  }

  const sessions = new SessionTokenRepository(infrastructure.postgres);
  const replay = new ProofReplayStore(infrastructure.redis);
  const idempotency = new IdempotencyRepository(infrastructure.postgres);
  const provider = new OpenAICompatibleChatProvider({
    endpoint: config.providerEndpoint,
    apiKey: config.providerApiKey,
    model: config.providerModel,
    ...(config.providerTimeoutMs === undefined ? {} : { timeoutMs: config.providerTimeoutMs })
  });
  const chat = new ChatCompletionService(idempotency, provider, {
    systemInstruction: config.personaSystemInstruction,
    maxOutputTokens: config.maxOutputTokens
  });

  registerChatRoute(app, {
    authenticate: input => authenticateCortanaRequest(input, sessions, replay),
    chat,
    maxOutputTokens: config.maxOutputTokens
  });
}
