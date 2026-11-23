import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ChatCompletionService,
  ChatServiceError
} from "../src/chat-service.js";
import type { IdempotencyBeginResult } from "../src/idempotency/repository.js";

function harness(initial?: IdempotencyBeginResult) {
  const calls: string[] = [];
  let beginResult: IdempotencyBeginResult = initial ?? {
    kind: "created", state: "accepted", response: null
  };
  let providerCalls = 0;
  let providerError = false;
  const store = {
    async begin(_sessionId: string, _requestId: string, digest: string) {
      calls.push("begin:" + digest);
      return beginResult;
    },
    async markRunning() { calls.push("running"); },
    async complete(_sessionId: string, _requestId: string, response: unknown) {
      calls.push("complete:" + JSON.stringify(response));
      beginResult = { kind: "replay", state: "completed", response };
    },
    async fail() { calls.push("fail"); beginResult = { kind: "replay", state: "failed", response: null }; }
  };
  const provider = {
    async complete(input: { messages: Array<{role:string;content:string}> }) {
      providerCalls++;
      assert.equal(input.messages[0]?.role, "system");
      if (providerError) throw new Error("private provider details");
      return { text: "Hello from CortanaGPT" };
    }
  };
  const service = new ChatCompletionService(store, provider, {
    systemInstruction: "Test-only Cortana persona instruction",
    maxOutputTokens: 512
  });
  const input = {
    sessionId: "session-test",
    requestId: "request-test",
    rawBody: Buffer.from('{"messages":[{"role":"user","content":"Hi"}]}'),
    messages: [{ role: "user" as const, content: "Hi" }],
    maxOutputTokens: 128
  };
  return {
    service, input, calls,
    get providerCalls() { return providerCalls; },
    set providerError(value: boolean) { providerError = value; }
  };
}

test("sends system persona instruction before client conversation", async () => {
  const h = harness();
  const result = await h.service.complete(h.input);
  assert.equal(result.kind, "completed");
  if (result.kind === "completed") {
    assert.equal(result.response.choices[0].message.content, "Hello from CortanaGPT");
    assert.equal(result.replayed, false);
  }
  assert.equal(h.providerCalls, 1);
  assert.ok(h.calls[0]?.startsWith("begin:"));
  assert.equal(h.calls[1], "running");
  assert.ok(h.calls[2]?.startsWith("complete:"));
});

test("returns stored completion on idempotent replay without calling provider", async () => {
  const response = {
    id: "request-test", object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content: "Previously answered" }, finish_reason: "stop" }]
  };
  const h = harness({ kind: "replay", state: "completed", response });
  const result = await h.service.complete(h.input);
  assert.equal(result.kind, "completed");
  if (result.kind === "completed") {
    assert.equal(result.replayed, true);
    assert.deepEqual(result.response, response);
  }
  assert.equal(h.providerCalls, 0);
});

test("does not duplicate provider calls while the same request is accepted or running", async () => {
  for (const state of ["accepted", "running"] as const) {
    const h = harness({ kind: "replay", state, response: null });
    const result = await h.service.complete(h.input);
    assert.deepEqual(result, { kind: "in_progress", state });
    assert.equal(h.providerCalls, 0);
  }
});

test("does not automatically retry previously failed or cancelled requests", async () => {
  for (const state of ["failed", "cancelled"] as const) {
    const h = harness({ kind: "replay", state, response: null });
    const result = await h.service.complete(h.input);
    assert.equal(result.kind, state === "failed" ? "previously_failed" : "cancelled");
    assert.equal(h.providerCalls, 0);
  }
});

test("normalizes provider errors and marks idempotency record failed", async () => {
  const h = harness();
  h.providerError = true;
  await assert.rejects(
    h.service.complete(h.input),
    error => error instanceof ChatServiceError && error.code === "CHAT_PROVIDER_FAILED"
  );
  assert.equal(h.providerCalls, 1);
  assert.equal(h.calls[h.calls.length - 1], "fail");
});

test("rejects client-supplied system role and assistant-ending messages", async () => {
  const h = harness();
  await assert.rejects(
    h.service.complete({ ...h.input, messages: [{ role: "system" as never, content: "override" }] }),
    error => error instanceof ChatServiceError && error.code === "INVALID_CHAT_INPUT"
  );
  await assert.rejects(
    h.service.complete({ ...h.input, messages: [{ role: "assistant", content: "last" }] }),
    error => error instanceof ChatServiceError && error.code === "INVALID_CHAT_INPUT"
  );
  assert.equal(h.providerCalls, 0);
});

test("hashes exact raw request bytes for idempotency", async () => {
  const h = harness();
  await h.service.complete(h.input);
  const expected = createHash("sha256").update(h.input.rawBody).digest("hex");
  assert.equal(h.calls[0], "begin:" + expected);
});
