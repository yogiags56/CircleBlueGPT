# Backend gateway — planned

The backend is a required security boundary, not an optional proxy.

Design references:

- [Anonymous installation session protocol](ANONYMOUS_SESSION_PROTOCOL.md) — proposed enrollment, proof-of-possession, rotation and revocation contract.
- [Threat model](THREAT_MODEL.md) — assets, trust boundaries, threats, mitigations and implementation gates.

Both documents are proposals only; no backend endpoint is implemented or deployed.

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
- Automated unit/injection tests cover config validation and health/readiness behavior.
- GitHub Actions workflow `.github/workflows/backend-ci.yml` typechecks, tests and builds the backend.

Local development:

```sh
cd backend/server
cp .env.example .env
docker compose up -d
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

The scaffold intentionally does not expose enrollment, chat, token issuance or provider routes yet. The SQL file is a reviewed-design starting point, not an automatically applied production migration. Do not expose this development compose configuration to the public internet.
