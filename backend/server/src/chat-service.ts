import { createHash } from "node:crypto";
import type { ChatCompletionResult, ChatMessage } from "./provider/openai-compatible.js";
import { IdempotencyConflictError, type IdempotencyBeginResult } from "./idempotency/repository.js";

export interface ChatServiceInput {
  sessionId: string;
  requestId: string;
  rawBody: Buffer;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxOutputTokens: number;
}

export interface ChatServiceResponse {
  id: string;
  object: "chat.completion";
  choices: Array<{
    index: 0;
    message: { role: "assistant"; content: string };
    finish_reason: "stop";
  }>;
}

export type ChatServiceResult =
  | { kind: "completed"; response: ChatServiceResponse; replayed: boolean }
  | { kind: "in_progress"; state: "accepted" | "running" }
  | { kind: "previously_failed" }
  | { kind: "cancelled" };

export class ChatServiceError extends Error {
  constructor(readonly code:
    "INVALID_CHAT_INPUT" | "IDEMPOTENCY_CONFLICT" | "CHAT_PROVIDER_FAILED" | "CHAT_RESULT_PERSISTENCE_FAILED") {
    super(code);
    this.name = "ChatServiceError";
  }
}

interface IdempotencyStore {
  begin(sessionId: string, requestId: string, bodySha256Hex: string): Promise<IdempotencyBeginResult>;
  markRunning(sessionId: string, requestId: string): Promise<void>;
  complete(sessionId: string, requestId: string, response: unknown): Promise<void>;
  fail(sessionId: string, requestId: string): Promise<void>;
}

interface ChatProvider {
  complete(input: {
    messages: ChatMessage[];
    maxOutputTokens: number;
  }): Promise<ChatCompletionResult>;
}

export interface ChatServiceConfig {
  systemInstruction: string;
  maxOutputTokens: number;
}

const MAX_MESSAGES = 64;
const MAX_INPUT_CHARACTERS = 60000;

export class ChatCompletionService {
  constructor(
    private readonly idempotency: IdempotencyStore,
    private readonly provider: ChatProvider,
    private readonly config: ChatServiceConfig
  ) {
    if (typeof config.systemInstruction !== "string" ||
        config.systemInstruction.trim().length === 0 ||
        config.systemInstruction.length > 12000 ||
        !Number.isInteger(config.maxOutputTokens) ||
        config.maxOutputTokens < 1 || config.maxOutputTokens > 8192) {
      throw new Error("INVALID_CHAT_SERVICE_CONFIG");
    }
  }

  async complete(input: ChatServiceInput): Promise<ChatServiceResult> {
    validateInput(input, this.config.maxOutputTokens);

    let begun: IdempotencyBeginResult;
    try {
      const digest = createHash("sha256").update(input.rawBody).digest("hex");
      begun = await this.idempotency.begin(input.sessionId, input.requestId, digest);
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        throw new ChatServiceError("IDEMPOTENCY_CONFLICT");
      }
      throw error;
    }

    if (begun.kind === "replay") return replayResult(begun);

    await this.idempotency.markRunning(input.sessionId, input.requestId);
    const messages: ChatMessage[] = [
      { role: "system", content: this.config.systemInstruction },
      ...input.messages
    ];

    let completion: ChatCompletionResult;
    try {
      completion = await this.provider.complete({
        messages,
        maxOutputTokens: input.maxOutputTokens
      });
    } catch {
      // Only provider failures transition the record to failed.
      await this.idempotency.fail(input.sessionId, input.requestId);
      throw new ChatServiceError("CHAT_PROVIDER_FAILED");
    }

    const response: ChatServiceResponse = {
      id: input.requestId,
      object: "chat.completion",
      choices: [{
        index: 0,
        message: { role: "assistant", content: completion.text },
        finish_reason: "stop"
      }]
    };
    try {
      await this.idempotency.complete(input.sessionId, input.requestId, response);
    } catch {
      // Keep the record running: a retry must not make a second billable call
      // when the provider already answered but durable response storage failed.
      throw new ChatServiceError("CHAT_RESULT_PERSISTENCE_FAILED");
    }
    return { kind: "completed", response, replayed: false };
  }
}

function replayResult(result: IdempotencyBeginResult): ChatServiceResult {
  if (result.state === "completed") {
    if (!isChatResponse(result.response)) throw new Error("INVALID_STORED_CHAT_RESPONSE");
    return { kind: "completed", response: result.response, replayed: true };
  }
  if (result.state === "accepted" || result.state === "running") {
    return { kind: "in_progress", state: result.state };
  }
  if (result.state === "failed") return { kind: "previously_failed" };
  return { kind: "cancelled" };
}

function isChatResponse(value: unknown): value is ChatServiceResponse {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const root = value as Record<string, unknown>;
  if (typeof root.id !== "string" || root.object !== "chat.completion" ||
      !Array.isArray(root.choices) || root.choices.length !== 1) return false;
  const choice = root.choices[0] as Record<string, unknown> | null;
  if (!choice || choice.index !== 0 || choice.finish_reason !== "stop") return false;
  const message = choice.message as Record<string, unknown> | null;
  return !!message && message.role === "assistant" && typeof message.content === "string";
}

function validateInput(input: ChatServiceInput, maxOutputTokens: number): void {
  if (!input || typeof input.sessionId !== "string" || input.sessionId.length === 0 ||
      typeof input.requestId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.requestId) ||
      !Buffer.isBuffer(input.rawBody) || !Array.isArray(input.messages) ||
      input.messages.length < 1 || input.messages.length > MAX_MESSAGES ||
      !Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 ||
      input.maxOutputTokens > maxOutputTokens) {
    throw new ChatServiceError("INVALID_CHAT_INPUT");
  }
  let total = 0;
  for (const message of input.messages) {
    if (!message || !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" || message.content.length === 0) {
      throw new ChatServiceError("INVALID_CHAT_INPUT");
    }
    total += message.content.length;
    if (total > MAX_INPUT_CHARACTERS) throw new ChatServiceError("INVALID_CHAT_INPUT");
  }
  if (input.messages[input.messages.length - 1]?.role !== "user") {
    throw new ChatServiceError("INVALID_CHAT_INPUT");
  }
}
