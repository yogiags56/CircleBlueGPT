import test from "node:test";
import assert from "node:assert/strict";
import {
  ChatProviderError,
  OpenAICompatibleChatProvider
} from "../src/provider/openai-compatible.js";

const config = {
  endpoint: "https://provider.example/v1/chat/completions",
  apiKey: "test-secret-key-that-is-long-enough",
  model: "test-model"
};
const input = {
  messages: [{ role: "user" as const, content: "Hello Cortana" }],
  maxOutputTokens: 128
};

test("sends bounded OpenAI-compatible request and normalizes assistant output", async () => {
  let captured: RequestInit | undefined;
  const provider = new OpenAICompatibleChatProvider(config, async (_url, init) => {
    captured = init;
    return new Response(JSON.stringify({
      id: "provider-test-1",
      choices: [{ message: { role: "assistant", content: "Hello. I'm here." } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const result = await provider.complete(input);
  assert.deepEqual(result, { text: "Hello. I'm here.", providerRequestId: "provider-test-1" });
  assert.equal(captured?.method, "POST");
  assert.equal((captured?.headers as Record<string, string>).authorization, `Bearer ${config.apiKey}`);
  const body = JSON.parse(String(captured?.body));
  assert.equal(body.model, "test-model");
  assert.deepEqual(body.messages, input.messages);
});

test("rejects non-HTTPS provider endpoints and embedded URL credentials", () => {
  assert.throws(
    () => new OpenAICompatibleChatProvider({ ...config, endpoint: "http://provider.example/chat" }),
    error => error instanceof ChatProviderError && error.code === "PROVIDER_NOT_CONFIGURED"
  );
  assert.throws(
    () => new OpenAICompatibleChatProvider({ ...config, endpoint: "https://user:pass@provider.example/chat" }),
    error => error instanceof ChatProviderError && error.code === "PROVIDER_NOT_CONFIGURED"
  );
  assert.throws(
    () => new OpenAICompatibleChatProvider({ ...config, apiKey: "valid-but-bad\nheader-key" }),
    error => error instanceof ChatProviderError && error.code === "PROVIDER_NOT_CONFIGURED"
  );
});

test("rejects invalid input before making a provider call", async () => {
  let called = false;
  const provider = new OpenAICompatibleChatProvider(config, async () => {
    called = true;
    return new Response("{}");
  });
  await assert.rejects(
    provider.complete({ messages: [], maxOutputTokens: 128 }),
    error => error instanceof ChatProviderError && error.code === "PROVIDER_INVALID_INPUT"
  );
  assert.equal(called, false);
});

test("normalizes upstream errors without exposing provider response details", async () => {
  const provider = new OpenAICompatibleChatProvider(config, async () =>
    new Response("secret provider diagnostics", { status: 429 })
  );
  await assert.rejects(
    provider.complete(input),
    error => error instanceof ChatProviderError && error.code === "PROVIDER_UPSTREAM_ERROR"
  );
});

test("rejects malformed provider response bodies", async () => {
  const provider = new OpenAICompatibleChatProvider(config, async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 42 } }] }), { status: 200 })
  );
  await assert.rejects(
    provider.complete(input),
    error => error instanceof ChatProviderError && error.code === "PROVIDER_INVALID_RESPONSE"
  );
});

test("enforces provider response byte limits before parsing JSON", async () => {
  const provider = new OpenAICompatibleChatProvider({
    ...config, maxResponseBytes: 1024
  }, async () => new Response("x".repeat(2048), { status: 200 }));
  await assert.rejects(
    provider.complete(input),
    error => error instanceof ChatProviderError && error.code === "PROVIDER_RESPONSE_TOO_LARGE"
  );
});


test("enforces the configured assistant output character limit", async () => {
  const provider = new OpenAICompatibleChatProvider({
    ...config, maxOutputCharacters: 5
  }, async () => new Response(JSON.stringify({
    choices: [{ message: { content: "six!!!" } }]
  }), { status: 200 }));
  await assert.rejects(
    provider.complete(input),
    error => error instanceof ChatProviderError && error.code === "PROVIDER_INVALID_RESPONSE"
  );
});

test("aborts a provider request after the configured timeout", async () => {
  const provider = new OpenAICompatibleChatProvider({
    ...config, timeoutMs: 1000
  }, async (_url, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal as AbortSignal;
    signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  }));
  await assert.rejects(
    provider.complete(input),
    error => error instanceof ChatProviderError && error.code === "PROVIDER_TIMEOUT"
  );
});
