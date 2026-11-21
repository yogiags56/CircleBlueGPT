# Project status

**Snapshot:** 2026-11-21  
**Current stage:** 004U — session-token primitives and Android probe validation  
**Overall status:** legacy reverse-engineering and platform-neutral prototypes exist; the Android security probe now builds and passes API 35 emulator instrumentation tests. Cortana UI/runtime integration remains unvalidated.

## Verified baseline

- Original package: Microsoft Cortana Android 3.3.3.2876, en-us release.
- Package ID: `com.microsoft.cortana`.
- Minimum API 19; target API 29.
- Baseline SHA-256: `c8c3192bc29057dfc398f4cb8fa3bfc549422373e0688a4c6de993f37a233d6c`.
- The original APK is forensic input and must remain immutable. It is not committed to this repository.

## Completed static work

- APK manifest, DEX, JavaScript bundle, startup/authentication paths, React Native bridge, Newman conversation path, persona manager and persona assets have been inspected.
- 15 persona GIF segments were extracted and validated from four PERS containers (364 frames total, 100×116 each).
- The legacy account/token path is coupled to Microsoft services; hiding the sign-in screen alone is not a valid anonymous-session implementation.
- The Newman response model and minimum display-text contract have been mapped from bundled JavaScript.

## Android probe

- Android probe project is committed under `android/probe/`, with Android Keystore AES-256/GCM token encryption and private SharedPreferences ciphertext storage.
- API 19–22 persistent sensitive storage is explicitly disabled; no plaintext or weak-key fallback is allowed.
- Session destruction deletes the Android Keystore alias and clears encrypted token preferences.
- A pure-Java compatibility policy is covered by host-JVM unit tests for API 19, 22, 23 and 35. These tests verify the policy boundary; they are not a substitute for running Android on API 19–22.
- Android instrumentation tests exercise ciphertext round-trip, key-deletion invalidation and session destruction on API 35.
- Latest Android probe workflow run `44894581676` completed successfully: host-JVM API policy tests, APK assembly, and all 3 API 35 emulator instrumentation tests passed. A fresh branch-head Android workflow (`44897661202`) is running after the backend token repository additions.
- Latest probe artifact ID `14703004994`; ZIP SHA-256 `aff277847cd34bffe6d7d246538b8b9adebfa8f81d50ead07a4bb0189ac9e330`. ZIP integrity verified; app APK 11,274 bytes and instrumentation APK 1,679,116 bytes.

## Stage 004S CI evidence

- GitHub Actions run: `44890908678` (PR validation of branch commit `00f7349580ebd6690b87f875d6bbff7dc4bdd730`).
- Host-JVM API policy unit-test task: **passed** for the API 19, 22, 23 and 35 cases.
- Android API 35 emulator instrumentation: **3 tests completed successfully**, including ciphertext round-trip, key-deletion invalidation and session destruction.
- Debug app and instrumentation APKs uploaded as artifact `cortanagpt-probe-apks` (artifact ID `14701443910`).
- Artifact ZIP SHA-256: `a04d25604fdce1d33d32e44aa4bd03ada68c3d27e4c9b2cef1418565788b5635`.
- ZIP integrity verified; contents: debug app APK (11,274 bytes) and instrumentation APK (1,679,115 bytes).
- API 19–22 behavior remains validated only at the pure-Java policy level, not on real legacy Android runtimes.

## Prototype work (not production)

- Platform-neutral BridgeCore and AES-GCM codec prototypes exist in the recovery workspace.
- Java HTTP transport prototype uses HTTPS in production mode, bounded response parsing, request IDs, idempotency headers, bounded retries and best-effort server cancellation.
- These host-JVM prototypes are not yet promoted into the repository and are not part of the Android app.
- The probe is not the restored Cortana app and does not connect to a GPT provider.

## Stage 004T protocol design and review gate

- `backend/ANONYMOUS_SESSION_PROTOCOL.md` defines a proposed P-256 installation-key enrollment flow, short-lived scoped access tokens, proof-of-possession request signatures, replay protection, durable idempotency, rotation and revocation.
- Rotation is specified as a separate authenticated flow bound to the existing session key; it is not first-time enrollment.
- This is a design document only. It has not undergone independent cryptographic review and no endpoint is live.

## Backend scaffold and security primitives

- Node.js 22 / TypeScript / Fastify server skeleton under `backend/server/`.
- Configuration validation, liveness and dependency readiness routes are implemented with dependency injection for tests.
- PostgreSQL/Redis wiring, local Docker Compose services and a transactional initial schema migration are present.
- Durable idempotency repository supports first-write, same-body replay, body-hash conflict, state transitions and concurrent duplicate-request handling.
- P-256 security helpers validate public-only JWKs (including curve-point validity), calculate RFC 7638 thumbprints and verify ECDSA-SHA256 signatures.
- Redis proof replay store uses atomic `SET NX` with TTL and unambiguous length-prefixed session/proof identifiers.
- PostgreSQL enrollment challenge repository creates 32-byte nonces and opaque IDs, bounds expiry, binds purpose and atomically consumes enrollment challenges once.
- Session-token repository issues opaque 256-bit access tokens, stores only SHA-256 token hashes, checks active session/token state, enforces fixed scopes and bounded lifetime, prevents repeat initial issuance, requires the current unexpired token for rotation, and revokes session/token state transactionally.
- Backend CI run `44897661183` passed strict TypeScript typecheck/build, both migration passes and **41/41 tests** against PostgreSQL/Redis services. The tests include challenge single-use/expiry/purpose isolation, P-256 signature and off-curve rejection, Redis replay concurrency, idempotency and session-token hash/authentication/expiry/rotation/revocation behavior.
- These are repository-level primitives and health routes only. No public enrollment/authentication/rotation/revocation/chat endpoints, DPoP middleware, provider adapter or production deployment exists. The custom proof-of-possession protocol has not received independent cryptographic review.
- No exactly-once external provider execution is claimed; idempotency is not yet connected to a chat/provider orchestration route.

## Security and release constraints

- Keep provider credentials exclusively on the backend; never embed provider API keys in the APK.
- Keep the original Cortana APK immutable and out of Git.
- Keep the working branch and draft PR separate from `main` until explicit approval.
- Local memory must remain encrypted and user-controllable; only selected relevant context should be sent to the backend.

## Next objectives

1. Review the proposed Stage 004T protocol and threat model; obtain independent cryptographic review before implementation.
2. Promote and validate the platform-neutral BridgeCore, AES-GCM codec and HTTP transport source/tests from the recovery workspace when the exact files are available.
3. Obtain independent cryptographic review of the custom proof-of-possession protocol before composing the tested challenge, P-256, replay and token primitives into public enrollment/session endpoints. The repository-level session-token tests have passed 41/41 in CI.
4. Build the Android–GPT transport bridge against a mock backend.
5. Integrate the original Cortana UI/persona only after backend and bridge gates pass.
