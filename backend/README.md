# Backend gateway — planned

The backend is a required security boundary, not an optional proxy.

## Responsibilities

- Anonymous installation enrollment and session lifecycle.
- Short-lived scoped access tokens and revocation.
- Request validation, quotas and abuse controls.
- Durable idempotency for `(installation/session, requestId)`.
- GPT provider adapter; provider secrets remain server-side.
- Normalized response DTO matching the documented project contract.
- Best-effort cancellation endpoint.
- Redacted operational logs and metrics.

## Proposed endpoints (not implemented)

- `POST /v1/sessions` — enroll or rotate an anonymous installation session.
- `POST /v1/chat/completions` — submit a conversation turn.
- `DELETE /v1/requests/{requestId}` — request cancellation.
- `DELETE /v1/sessions/current` — revoke the current session.

## Required invariants

1. A repeated idempotency key for the same session must not trigger a second billable model call.
2. The response request ID must equal the client request ID.
3. Cancellation is best effort and may race with completion; clients must deduplicate terminal events.
4. Enforce body and output limits before allocating unbounded memory.
5. Never expose provider credentials or internal stack traces to clients.

No live backend, enrollment flow, provider configuration or production endpoint exists yet. Do not configure the Android client with a made-up URL.
