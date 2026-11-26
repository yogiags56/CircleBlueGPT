# Anonymous session backend threat model

**Status:** initial design review aid; not an independent security assessment.  
**Scope:** anonymous Android installation enrollment, session authentication, chat request handling and revocation.

## Assets

- Installation private signing key held by Android Keystore.
- Short-lived access tokens and server-side session state.
- Challenge nonces and proof replay identifiers.
- Chat input, selected memory context and model responses.
- Provider API credentials and backend operational secrets.
- Durable idempotency records and billing/provider-call state.

## Trust boundaries

1. Android application process and local device storage.
2. Public HTTPS API edge and rate limiter.
3. Enrollment/session service and session database.
4. Chat orchestration, idempotency store and provider adapter.
5. External model provider.

The Android client is not trusted to enforce quotas, authorization, idempotency or provider secrecy. The API edge and backend must enforce those properties independently.

## Threats and required controls

| Threat | Example | Required controls | Residual risk |
|---|---|---|---|
| Enrollment replay | Re-submit a captured enrollment proof | Random single-use challenge, short expiry, atomic consumption, purpose/session binding | Attacker can still request many fresh challenges without quotas |
| Session-token theft | Malware reads app preferences or a backup | Keystore-protected key, encrypted token storage, short token lifetime, proof of possession, exclude secrets from backups | Malware controlling the app process may invoke the signing key |
| Proof replay | Replay a previously valid authenticated request | Signed timestamp and unique proof ID; atomic replay cache; body hash and method/path binding | Clock skew and distributed replay-store consistency must be handled |
| Key substitution | Enroll or rotate a different public key | Verify JWK thumbprint and signature; rotation requires current-session proof and same bound key | Device compromise may authorize use of the legitimate key |
| Challenge-purpose confusion | Use an enrollment challenge as a rotation challenge | Explicit purpose; separate enrollment and rotation completion endpoints; bind rotation challenge to active session | Implementation mistakes in state transitions |
| Anonymous enrollment abuse | Bot farm creates sessions and consumes model quota | IP/network and per-key limits, progressive abuse controls, quotas, provider spend caps | Shared NATs and privacy relays can complicate attribution |
| Duplicate billable requests | Retry or race sends same turn twice | Transactional session/request idempotency; body-hash conflict detection; persist state before provider dispatch | Provider timeout after execution may leave uncertain completion; reconciliation required |
| Authorization leakage | Token appears in logs, crash reports or analytics | Structured redaction, no raw headers, secret scanning, restricted log access | Third-party instrumentation may capture unexpected data |
| Provider-secret compromise | API key extracted from APK or logs | Provider secret only in backend secret manager; scoped credentials, rotation, egress controls | Backend runtime compromise remains high impact |
| Denial of service / cost exhaustion | Oversized bodies, long prompts, rapid requests | Body limits at edge, bounded parsing, output caps, quotas, concurrency limits and global spend alarms | Distributed attacks can still consume infrastructure resources |
| Local data loss | User clears app data or Keystore key is invalidated | No hidden recovery secret; re-enroll as a new installation; session expires/revokes | Old encrypted local data may become unrecoverable |
| Legacy-platform downgrade | API 19–22 silently stores a token insecurely | Fail closed; no plaintext or hard-coded-key fallback; separately review any compatibility design | Legacy devices cannot use persistent secure session storage in this MVP |

## Security assumptions

- HTTPS certificate validation is enabled and redirects are rejected for authenticated requests.
- Android Keystore private keys are non-exportable on supported devices, but non-exportability does not prevent a compromised app process from asking the key to sign.
- The backend database supports atomic challenge consumption, token revocation and idempotency transitions.
- Provider credentials are injected at runtime from a managed secret store and are never returned to the client.
- The backend can apply global spend and concurrency limits independent of client-provided metadata.

## Decisions required before implementation

1. Select backend runtime, database and deployment environment.
2. Define canonical request serialization and interoperability test vectors for JWK thumbprints and ECDSA signatures.
3. Decide challenge/replay/idempotency retention and distributed atomicity requirements.
4. Define rate limits, per-session quotas, global provider spend caps and abuse response.
5. Define privacy retention for chat content, selected memory, logs and idempotency results.
6. Decide whether hardware-backed key attestation is optional telemetry or an enforced policy; do not make unsupported devices fail without an explicit product decision.
7. Obtain independent cryptographic review of the custom proof-of-possession format before production use.

## MVP release gates

- Automated negative tests for every rejection case in the anonymous session protocol.
- Concurrency tests prove one challenge consumption and one provider execution per idempotency key.
- Security tests prove tokens and provider credentials never enter logs or client artifacts.
- Load/abuse tests verify request and spend limits.
- Key loss, app-data clear, session expiry and revocation have documented user-visible behavior.
- No production rollout until protocol review, operational monitoring and incident response are ready.

## Out of scope

- User identity, social login, cross-device account sync and account recovery.
- Device fingerprinting through IMEI, advertising ID, phone number or persistent hardware identifiers.
- Remote privileged actions such as calls, SMS, alarms, contacts or device settings.
- Claims that a rooted or malware-compromised device can be made fully trustworthy by Android Keystore alone.
