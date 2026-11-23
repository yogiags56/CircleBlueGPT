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

## Android chat transport boundary (Stage 004V-3 proposal)

The Android probe now has a strict protocol codec and an injectable HTTPS gateway. The endpoint URL and background executor are supplied by the host application; no production endpoint is compiled into the APK.

- Request DTO: `protocolVersion`, `requestId`, optional `conversationId`, `input.text`, `context.selectedMemory`.
- Response DTO: `protocolVersion`, matching `requestId`, `message.text`.
- Request JSON limit: 64 KiB. Response body limit: 256 KiB. Response text limit: 65,536 characters.
- The client requires HTTPS, uses the platform's default TLS certificate validation, disables redirects, accepts only HTTP 200, sets connect/read timeouts and an idempotency header, and rejects malformed UTF-8/JSON or request-ID mismatch.
- Cancellation is best-effort: the client disconnects the active connection and suppresses late callbacks, but this does not prove server-side or provider execution stopped.
- The transport has no Authorization header yet. Anonymous session authentication remains blocked on independent review of the custom CortanaPoP scheme.
- The injected executor must perform network I/O off the Android main thread. The bridge callback dispatcher is separately responsible for returning terminal UI events to the main looper.

This is a client-side transport implementation against an injected/mock endpoint, not evidence that a backend chat route exists or is deployed. No GPT provider integration is wired.



## CortanaPoP request-header contract (proposal; not wired)

The authenticated request proposal uses these exact headers:

- `Authorization: CortanaPoP {43-character-base64url-access-token}`
- `X-Cortana-Proof: {base64url-DER-ECDSA-signature}`
- `X-Cortana-Timestamp: {Unix-seconds-decimal}`
- `X-Cortana-Proof-ID: {fresh-unique-base64url-id}`
- `X-Request-ID: {client-idempotency-id}` for chat requests

The timestamp and proof ID are signed canonical fields, not optional metadata. Generate a new proof ID and signature for each HTTP attempt, including retries; keep the same request ID only when retrying the same logical chat operation with the exact same body. The server must reject duplicate security-sensitive headers and must verify exact raw body bytes before JSON parsing.

The route-independent backend guard in `backend/server/src/security/authenticated-request.ts` verifies the token's active session, stored P-256 JWK thumbprint binding, detached signature, five-minute atomic Redis replay claim and required scope. It is intentionally not connected to Fastify until the custom scheme receives independent review and route-level raw-body/header handling is implemented.