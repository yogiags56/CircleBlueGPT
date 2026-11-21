# Architecture overview

## Target shape

```text
Cortana Android UI + Persona
          |
          v
CortanaGPT bridge (typed request/response + lifecycle)
          |
          | HTTPS, anonymous session token
          v
CortanaGPT backend
          |
          +--> durable idempotency / cancellation registry
          |
          +--> GPT provider adapter (provider secret stays server-side)
```

Local encrypted memory is an Android-side subsystem. The app selects only relevant memory snippets for a request; the backend must not receive the entire local store by default.

## Components

### Android shell

The long-term goal is to preserve Cortana's identity, blue ring, original interaction language and persona animation. The existing APK is an analysis baseline, not yet a modifiable production foundation. The first implementation should remain an isolated probe app until bridge and security behavior are validated.

### Bridge boundary

The bridge owns readiness, request IDs, one terminal result per request, cancellation, bounded event buffering and lifecycle-safe delivery. The legacy Newman contract is useful compatibility evidence, but it is not an official modern backend schema.

### Backend gateway

The backend authenticates an anonymous installation/session, validates request size and schema, enforces quotas, durably deduplicates idempotency keys, calls the configured model provider, normalizes the result into a narrow response DTO and supports best-effort cancellation.

### Memory

Memory is encrypted at rest where supported. Keys are generated and held by Android Keystore. On devices where the required primitive cannot be safely provided, persistent sensitive storage stays disabled rather than silently downgrading to plaintext.

## Request contract (proposed, version 1)

Request:

```json
{
  "protocolVersion": 1,
  "requestId": "client-generated-id",
  "conversationId": "optional-conversation-id",
  "input": { "text": "user message" },
  "context": { "selectedMemory": [] }
}
```

Response:

```json
{
  "protocolVersion": 1,
  "requestId": "same-client-generated-id",
  "message": { "text": "assistant response" }
}
```

This is a project proposal, not an existing server/provider guarantee. Reject mismatched request IDs, missing text, malformed JSON and oversized bodies.

## Non-goals for the first milestone

- Reusing Microsoft account tokens, Bing headers or legacy CSDK authentication.
- Registering old Cortana skill handlers for alarms, calls, SMS, settings or other privileged actions.
- Shipping a provider API key in the APK.
- Replacing Cortana's visual identity with a generic chatbot UI.
- Claiming the legacy APK is patched or runtime-compatible before a reproducible test proves it.
