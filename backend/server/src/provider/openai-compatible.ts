export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionInput {
  messages: ChatMessage[];
  maxOutputTokens: number;
}

export interface ChatCompletionResult {
  text: string;
  providerRequestId?: string;
}

export interface OpenAICompatibleProviderConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxOutputCharacters?: number;
}

export class ChatProviderError extends Error {
  constructor(
    readonly code: "PROVIDER_NOT_CONFIGURED" | "PROVIDER_INVALID_INPUT" |
      "PROVIDER_TIMEOUT" | "PROVIDER_NETWORK_ERROR" | "PROVIDER_UPSTREAM_ERROR" |
      "PROVIDER_INVALID_RESPONSE" | "PROVIDER_RESPONSE_TOO_LARGE"
  ) {
    super(code);
    this.name = "ChatProviderError";
  }
}

const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_MAX_OUTPUT_CHARACTERS = 65536;
const MAX_INPUT_CHARACTERS = 65536;
const MAX_MESSAGES = 64;

export class OpenAICompatibleChatProvider {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly maxOutputCharacters: number;

  constructor(
    config: OpenAICompatibleProviderConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    if (!config.apiKey || config.apiKey.trim().length < 16 ||
        !config.model || config.model.trim().length === 0) {
      throw new ChatProviderError("PROVIDER_NOT_CONFIGURED");
    }

    let parsed: URL;
    try {
      parsed = new URL(config.endpoint);
    } catch {
      throw new ChatProviderError("PROVIDER_NOT_CONFIGURED");
    }
    if (parsed.protocol !== "https:" || !parsed.hostname ||
        parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new ChatProviderError("PROVIDER_NOT_CONFIGURED");
    }

    const timeoutMs = config.timeoutMs ?? 30000;
    const maxResponseBytes = config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const maxOutputCharacters = config.maxOutputCharacters ?? DEFAULT_MAX_OUTPUT_CHARACTERS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000 ||
        !Number.isInteger(maxResponseBytes) || maxResponseBytes < 1024 || maxResponseBytes > 1048576 ||
        !Number.isInteger(maxOutputCharacters) || maxOutputCharacters < 1 || maxOutputCharacters > 262144) {
      throw new ChatProviderError("PROVIDER_NOT_CONFIGURED");
    }

    this.endpoint = parsed.toString();
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
    this.maxOutputCharacters = maxOutputCharacters;
  }

  async complete(input: ChatCompletionInput): Promise<ChatCompletionResult> {
    validateInput(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          "authorization": `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "accept": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          messages: input.messages,
          max_tokens: input.maxOutputTokens
        }),
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === "AbortError") {
        throw new ChatProviderError("PROVIDER_TIMEOUT");
      }
      throw new ChatProviderError("PROVIDER_NETWORK_ERROR");
    }

    let bytes: Buffer;
    try {
      bytes = await readResponseLimited(response, this.maxResponseBytes);
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof ChatProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ChatProviderError("PROVIDER_TIMEOUT");
      }
      throw new ChatProviderError("PROVIDER_NETWORK_ERROR");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw new ChatProviderError("PROVIDER_UPSTREAM_ERROR");

    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new ChatProviderError("PROVIDER_INVALID_RESPONSE");
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ChatProviderError("PROVIDER_INVALID_RESPONSE");
    }
    const root = parsed as Record<string, unknown>;
    const choices = root.choices;
    if (!Array.isArray(choices) || choices.length < 1 ||
        choices[0] === null || typeof choices[0] !== "object") {
      throw new ChatProviderError("PROVIDER_INVALID_RESPONSE");
    }
    const message = (choices[0] as Record<string, unknown>).message;
    if (message === null || typeof message !== "object" || Array.isArray(message)) {
      throw new ChatProviderError("PROVIDER_INVALID_RESPONSE");
    }
    const text = (message as Record<string, unknown>).content;
    if (typeof text !== "string" || text.trim().length === 0 ||
        text.length > this.maxOutputCharacters) {
      throw new ChatProviderError("PROVIDER_INVALID_RESPONSE");
    }
    const id = root.id;
    return {
      text,
      ...(typeof id === "string" && id.length <= 128 ? { providerRequestId: id } : {})
    };
  }
}

function validateInput(input: ChatCompletionInput): void {
  if (!input || !Array.isArray(input.messages) || input.messages.length < 1 ||
      input.messages.length > MAX_MESSAGES ||
      !Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 ||
      input.maxOutputTokens > 8192) {
    throw new ChatProviderError("PROVIDER_INVALID_INPUT");
  }
  let total = 0;
  for (const message of input.messages) {
    if (!message || !["system", "user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" || message.content.length === 0) {
      throw new ChatProviderError("PROVIDER_INVALID_INPUT");
    }
    total += message.content.length;
    if (total > MAX_INPUT_CHARACTERS) {
      throw new ChatProviderError("PROVIDER_INVALID_INPUT");
    }
  }
}

async function readResponseLimited(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new ChatProviderError("PROVIDER_INVALID_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ChatProviderError("PROVIDER_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), total);
}
