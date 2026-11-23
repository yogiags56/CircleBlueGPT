import test from "node:test";
import assert from "node:assert/strict";
import { registerChatSubsystem } from "../src/chat-subsystem.js";

const infrastructure = {
  postgres: {} as never,
  redis: {} as never
};

const valid = {
  providerEndpoint: "https://provider.example/v1/chat/completions",
  providerApiKey: "test-provider-secret-long-enough",
  providerModel: "test-model",
  personaSystemInstruction: "Cortana persona test instruction",
  maxOutputTokens: 1024
};

test("requires a bounded non-empty Cortana persona instruction", () => {
  assert.throws(
    () => registerChatSubsystem({} as never, infrastructure, { ...valid, personaSystemInstruction: " " }),
    /INVALID_CORTANA_PERSONA_INSTRUCTION/
  );
  assert.throws(
    () => registerChatSubsystem({} as never, infrastructure, { ...valid, personaSystemInstruction: "x".repeat(12001) }),
    /INVALID_CORTANA_PERSONA_INSTRUCTION/
  );
});

test("requires a bounded output token policy before provider construction", () => {
  assert.throws(
    () => registerChatSubsystem({} as never, infrastructure, { ...valid, maxOutputTokens: 0 }),
    /INVALID_CHAT_OUTPUT_TOKEN_LIMIT/
  );
  assert.throws(
    () => registerChatSubsystem({} as never, infrastructure, { ...valid, maxOutputTokens: 8193 }),
    /INVALID_CHAT_OUTPUT_TOKEN_LIMIT/
  );
});

test("rejects unconfigured or insecure provider settings during explicit composition", () => {
  assert.throws(
    () => registerChatSubsystem({} as never, infrastructure, { ...valid, providerApiKey: "" }),
    /PROVIDER_NOT_CONFIGURED/
  );
  assert.throws(
    () => registerChatSubsystem({} as never, infrastructure, { ...valid, providerEndpoint: "http://provider.example/chat" }),
    /PROVIDER_NOT_CONFIGURED/
  );
});

test("rejects an invalid per-minute chat rate limit before registering the route", () => {
  assert.throws(
    () => registerChatSubsystem({} as never, infrastructure, { ...valid, rateLimitRequestsPerMinute: 0 }),
    /INVALID_CHAT_RATE_LIMIT/
  );
  assert.throws(
    () => registerChatSubsystem({} as never, infrastructure, { ...valid, rateLimitRequestsPerMinute: 1001 }),
    /INVALID_CHAT_RATE_LIMIT/
  );
});