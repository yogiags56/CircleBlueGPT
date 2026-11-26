# Security model and reporting

## Non-negotiable rules

- Never embed model-provider API keys, signing keys, backend master secrets or administrative credentials in the Android app.
- Never reuse Microsoft/Bing tokens, legacy API keys or authentication headers as GPT credentials.
- Use HTTPS only outside explicit loopback tests. Disable redirects for authenticated API calls unless a reviewed policy says otherwise.
- Bind idempotency to the authenticated installation/session and request ID. A client retry without durable server deduplication can duplicate model execution and billing.
- Keep session tokens out of logs, crash reports, analytics and clipboard.
- Store sensitive local data encrypted; do not introduce plaintext fallback when secure storage is unavailable.
- Treat the original APK and extracted assets as untrusted/proprietary inputs. Do not commit the original APK or large proprietary payloads.

## Anonymous session design (planned)

Anonymous must mean no user-facing Microsoft login, not unauthenticated public access. A future enrollment protocol should use an installation key pair or equivalent proof-of-possession, short-lived scoped session tokens, server-side revocation and abuse controls. Exact protocol is not implemented yet.

## Android API compatibility

The current probe design gates Android Keystore AES-GCM key generation at API 23. API 19–22 persistent token encryption remains unsupported in this prototype; do not replace that with plaintext or a weak hard-coded key. A separately reviewed compatible design is required if API 19–22 persistent memory becomes a product requirement.

## Data minimization

- Keep conversation history local by default.
- Select only context relevant to the current prompt.
- Provide user-visible controls to inspect, clear and disable memory.
- Avoid sending identifiers or sensitive profile information unless required and explicitly justified.

## Reporting

Do not publish secrets or exploit details in public issues. For a suspected vulnerability, contact the repository maintainer privately through GitHub's security reporting mechanism if enabled.
