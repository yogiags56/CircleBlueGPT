# Backend gateway — planned

The backend is a required security boundary, not an optional proxy.

Design references:

- [Anonymous installation session protocol](ANONYMOUS_SESSION_PROTOCOL.md) — proposed enrollment, proof-of-possession, rotation and revocation contract.
- [Threat model](THREAT_MODEL.md) — assets, trust boundaries, threats, mitigations and implementation gates.

The custom CortanaPoP wire protocol remains a proposal, is not RFC 9449 DPoP, and has not undergone independent cryptographic review. The server scaffold now contains tested persistence/security primitives, but no public enrollment, authentication, rotation, revocation or chat endpoint is implemented or deployed. A route-independent verifier primitive and negative/positive test vectors now exist under `server/src/security/cortana-pop.ts`; this does not constitute protocol approval or public-route readiness.

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

- `POST /v1/enrollment/challenges` — request a one-time enrollment or authenticated rotation challenge.
- `POST /v1/sessions` — complete first-time enrollment.
- `POST /v1/sessions/rotate` — rotate an existing authenticated session.
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


## Backend scaffold

The first TypeScript/Fastify scaffold is under `server/`.

- Node.js 22 and strict TypeScript configuration.
- `GET /health/live` is a process liveness check.
- `GET /health/ready` checks PostgreSQL and Redis independently and fails closed.
- PostgreSQL initial schema proposal is in `server/db/001_initial_schema.sql`.
- Local PostgreSQL and Redis services are defined in `server/docker-compose.yml`.
- Automated tests cover config validation, health/readiness behavior, malformed/oversized bodies, PostgreSQL schema presence and Redis connectivity. CI provisions real PostgreSQL/Redis services and verifies migration idempotency.
- GitHub Actions workflow `.github/workflows/backend-ci.yml` typechecks, tests and builds the backend.

Local development:

```sh
cd backend/server
cp .env.example .env
docker compose up -d
npm install
npm run typecheck
npm run build
npm run migrate
npm test
npm run dev
```

The scaffold intentionally does not expose enrollment, chat, token issuance or provider routes yet. Implemented repository primitives include one-time enrollment challenge persistence, P-256 JWK/signature verification, Redis proof replay claims, durable idempotency, and a session-token repository that stores SHA-256 token hashes and supports guarded rotation/revocation. The session-token repository and its seven lifecycle tests passed in backend CI run `44897661183` (41/41 total tests). A follow-up CI run is validating the current naming/protocol documentation hardening. These are not route-level security controls and must not be exposed directly.

The SQL file is an initial development migration, not a production migration approval. The custom CortanaPoP proof-of-possession protocol requires independent review before any public endpoint is wired to these primitives. Do not expose this development compose configuration to the public internet.


## CortanaPoP verifier primitive (not a route)

`server/src/security/cortana-pop.ts` implements the proposal's detached-signature canonicalization and P-256 verification over the exact raw body bytes, uppercase method, origin-form path+query, timestamp, proof ID and access-token hash. It rejects malformed targets, invalid timestamp windows, malformed IDs/tokens and invalid signatures. Unit tests use ephemeral test-only keys.

This helper intentionally does not consume replay IDs, authenticate session tokens, authorize scopes, or establish a trusted request-body capture boundary. A future route must, in order: obtain the token and active session from the token repository; capture exact raw bytes and trusted origin-form target; call the verifier; atomically claim the proof ID in Redis; enforce scope and quotas; then enter the idempotency/provider pipeline. The exact order and canonicalization still require independent review and cross-language test vectors. Do not wire this helper to a public route yet.
