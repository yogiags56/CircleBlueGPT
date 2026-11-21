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
