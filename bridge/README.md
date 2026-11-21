# Android / React Native bridge

## Current state

The legacy application exposes a Newman bridge with text-query, listening, cancellation and conversation-reset methods. The static audit mapped the JS/native event relationship and response DTO shape. This does not prove the old Microsoft CSDK is operational or reusable.

## Proposed bridge API

- `getBridgeStatus()` — readiness and capability snapshot.
- `sendQuery(requestId, conversationId, text)` — submit text only.
- `cancelQuery(requestId)` — cancel local delivery and request backend cancellation.
- `resetConversation(conversationId)` — clear transient conversation state.

## Required behavior

- Text-only MVP; do not auto-start microphone/KWS.
- Register event listeners before enabling query submission.
- Gate submission until the native bridge and backend session are ready.
- Deliver at most one terminal result per request ID.
- Buffer only bounded events while the UI is temporarily detached; define replay/expiry semantics.
- Never leave a promise pending indefinitely: use explicit timeout and structured error states.
- Preserve persona/UI ownership in the app shell; transport code must not own persona animation state.

The proposed API is a design contract, not an implemented React Native NativeModule.

## Stage 004V implementation status

A platform-neutral Java foundation now exists in `android/probe/app/src/main/java/com/cortanagpt/probe/bridge/`:

- `ChatRequest` validates text-only input, request/conversation IDs and bounded selected-memory context (maximum 10 items, 2,048 characters per item, 8,192 characters total).
- `ChatResponse` accepts only a matching request ID and nonempty bounded response text; provider metadata, tools and actions are intentionally excluded.
- `BridgeCore` prevents duplicate active request IDs and arbitrates success, failure and cancellation so only one terminal callback wins. Late callbacks after cancellation are ignored.
- The gateway is injected as an interface. No HTTP client, production URL, session authentication or GPT provider is wired into this probe.

The first CI run exposed a test-fixture mistake: the aggregate-memory test used one item larger than the per-item limit, so it did not reach the aggregate check. The fixture was corrected to use five individually valid 1,700-character items (8,500 total). The corrected CI run is pending.

**Threading contract:** callbacks currently run on the thread that completes the gateway operation (or the caller thread for cancellation). An Android UI adapter must marshal callbacks onto the main thread. This core is not a React Native NativeModule and does not yet implement bounded streaming/event buffering or timeout policy.
