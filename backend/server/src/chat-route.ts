import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  AuthenticatedRequestInput,
  AuthenticatedRequestResult
} from "./security/authenticated-request.js";
import type { ChatCompletionService, ChatServiceResult } from "./chat-service.js";

export interface ChatRouteDependencies {
  authenticate(input: AuthenticatedRequestInput): Promise<AuthenticatedRequestResult>;
  chat: Pick<ChatCompletionService, "complete">;
  maxOutputTokens: number;
}

const SECURITY_HEADERS = [
  "authorization",
  "x-cortana-proof",
  "x-cortana-timestamp",
  "x-cortana-proof-id",
  "x-request-id",
  "content-type"
] as const;

export function installRawJsonBodyParser(app: FastifyInstance): void {
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" },
    (_request, body, done) => done(null, body));
}

/**
 * Opt-in HTTP adapter. Deliberately not registered by buildApp/main until the
 * CortanaPoP scheme receives independent review and deployment policy is ready.
 */
export function registerChatRoute(
  app: FastifyInstance,
  dependencies: ChatRouteDependencies
): void {
  app.post("/v1/chat/completions", async (request, reply) => {
    const duplicates = duplicateSensitiveHeaders(request);
    if (duplicates.length > 0) {
      return reply.code(400).send(errorBody("DUPLICATE_SECURITY_HEADER", "A security-sensitive header was repeated."));
    }

    const rawBody = request.body;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      return reply.code(400).send(errorBody("INVALID_REQUEST_BODY", "A JSON request body is required."));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return reply.code(400).send(errorBody("INVALID_REQUEST_BODY", "The JSON request body is invalid."));
    }

    const payload = parseChatPayload(parsed, dependencies.maxOutputTokens);
    if (!payload) {
      return reply.code(400).send(errorBody("INVALID_CHAT_INPUT", "The chat request is invalid."));
    }

    const requestId = singleHeader(request, "x-request-id");
    if (!requestId || !/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) {
      return reply.code(400).send(errorBody("INVALID_REQUEST_ID", "A valid X-Request-ID header is required."));
    }

    const authorization = singleHeader(request, "authorization");
    const proof = singleHeader(request, "x-cortana-proof");
    const timestamp = singleHeader(request, "x-cortana-timestamp");
    const proofId = singleHeader(request, "x-cortana-proof-id");
    const pathAndQuery = request.raw.url;
    if (!pathAndQuery || !pathAndQuery.startsWith("/") || pathAndQuery.includes("#")) {
      return reply.code(400).send(errorBody("INVALID_REQUEST_TARGET", "The request target is invalid."));
    }

    let authentication: AuthenticatedRequestResult;
    try {
      authentication = await dependencies.authenticate({
        method: request.method,
        pathAndQuery,
        rawBody,
        headers: {
          ...(authorization === undefined ? {} : { authorization }),
          ...(proof === undefined ? {} : { proof }),
          ...(timestamp === undefined ? {} : { timestamp }),
          ...(proofId === undefined ? {} : { proofId })
        },
        requiredScope: "chat:send"
      });
    } catch {
      return reply.code(503).send(errorBody("AUTHENTICATION_UNAVAILABLE", "Authentication is temporarily unavailable."));
    }

    if (!authentication.authenticated) {
      const forbidden = authentication.code === "INSUFFICIENT_SCOPE";
      return reply.code(forbidden ? 403 : 401).send(
        errorBody(authentication.code, forbidden ? "The session lacks permission for this operation." : "Authentication failed.")
      );
    }

    let result: ChatServiceResult;
    try {
      result = await dependencies.chat.complete({
        sessionId: authentication.session.sessionId,
        requestId,
        rawBody,
        messages: payload.messages,
        maxOutputTokens: payload.maxOutputTokens
      });
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "INVALID_CHAT_INPUT") {
        return reply.code(400).send(errorBody(code, "The chat request is invalid."));
      }
      if (code === "IDEMPOTENCY_CONFLICT") {
        return reply.code(409).send(errorBody(code, "This request ID was already used with a different request body."));
      }
      if (code === "CHAT_PROVIDER_FAILED") {
        return reply.code(502).send(errorBody(code, "The assistant provider could not complete the request."));
      }
      if (code === "CHAT_RESULT_PERSISTENCE_FAILED") {
        return reply.code(503).send(errorBody(code, "The response could not be safely stored. Do not retry with a new request ID."));
      }
      request.log.error({ err: error }, "Chat request failed");
      return reply.code(503).send(errorBody("CHAT_UNAVAILABLE", "The chat service is temporarily unavailable."));
    }

    if (result.kind === "completed") {
      if (result.replayed) reply.header("x-idempotent-replay", "true");
      return reply.code(200).send(result.response);
    }
    if (result.kind === "in_progress") {
      reply.header("retry-after", "1");
      return reply.code(202).send({ status: "in_progress", state: result.state, request_id: requestId });
    }
    if (result.kind === "previously_failed") {
      return reply.code(409).send(errorBody("REQUEST_PREVIOUSLY_FAILED", "This request previously failed and was not repeated."));
    }
    return reply.code(409).send(errorBody("REQUEST_CANCELLED", "This request was cancelled."));
  });
}

function duplicateSensitiveHeaders(request: FastifyRequest): string[] {
  const counts = new Map<string, number>();
  const raw = request.raw.rawHeaders;
  for (let i = 0; i < raw.length; i += 2) {
    const name = raw[i]!.toLowerCase();
    if ((SECURITY_HEADERS as readonly string[]).includes(name)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

function singleHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

function parseChatPayload(
  value: unknown,
  maxOutputTokens: number
): { messages: Array<{ role: "user" | "assistant"; content: string }>; maxOutputTokens: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  if (Object.keys(root).some(key => key !== "messages" && key !== "max_tokens") ||
      !Array.isArray(root.messages) || root.messages.length < 1 || root.messages.length > 64) return null;
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  let total = 0;
  for (const item of root.messages) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const message = item as Record<string, unknown>;
    if (Object.keys(message).some(key => key !== "role" && key !== "content") ||
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string" || message.content.length === 0) return null;
    total += message.content.length;
    if (total > 60000) return null;
    messages.push({ role: message.role, content: message.content });
  }
  if (messages[messages.length - 1]?.role !== "user") return null;
  const requested = root.max_tokens ?? Math.min(1024, maxOutputTokens);
  if (!Number.isInteger(requested) || (requested as number) < 1 || (requested as number) > maxOutputTokens) return null;
  return { messages, maxOutputTokens: requested as number };
}

function errorBody(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}
