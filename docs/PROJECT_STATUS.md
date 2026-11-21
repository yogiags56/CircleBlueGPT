# Project status

**Snapshot:** 2026-11-21  
**Current stage:** 004T — anonymous session protocol and backend scaffold  
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

## Stage 004T protocol design

- `backend/ANONYMOUS_SESSION_PROTOCOL.md` defines a proposed P-256 installation-key enrollment flow, short-lived scoped access tokens, proof-of-possession request signatures, replay protection, durable idempotency, rotation and revocation.
- Rotation is specified as a separate authenticated flow bound to the existing session key; it is not first-time enrollment.
- This is a design document only. It has not undergone independent cryptographic review and no endpoint is live.

## Backend scaffold (implementation started)

- A Node.js 22 / TypeScript / Fastify server skeleton exists under `backend/server/`.
- Configuration validation, liveness and dependency readiness routes are implemented with dependency injection for tests.
- PostgreSQL/Redis connection wiring, a proposed initial schema and local Docker Compose services are present.
- Unit tests cover configuration and health/readiness behavior.
- Backend CI run #20 completed successfully: strict TypeScript typecheck, **9/9 automated tests passed**, and production TypeScript build succeeded.
- Tests use Fastify injection and dependency fakes; PostgreSQL/Redis live integration, migrations, enrollment and GPT calls are not yet exercised.
- No enrollment, session issuance, chat completion, cryptographic proof validation or GPT provider adapter is implemented. The service is not production-ready.

## Not yet verified
- Real Android API 19–22 runtime behavior (the host-JVM tests validate only the compatibility policy).
- Backend enrollment, anonymous session issuance, provider integration or durable idempotency.
- React Native bridge integration, original APK patching, signing or installation.
- End-to-end conversation with a real GPT provider.

## Security and release constraints

- Keep provider credentials exclusively on the backend; never embed provider API keys in the APK.
- Keep the original Cortana APK immutable and out of Git.
- Keep the working branch and draft PR separate from `main` until explicit approval.
- Local memory must remain encrypted and user-controllable; only selected relevant context should be sent to the backend.

## Next objectives

1. Review the proposed Stage 004T protocol and threat model; obtain independent cryptographic review before implementation.
2. Promote and validate the platform-neutral BridgeCore, AES-GCM codec and HTTP transport source/tests from the recovery workspace when the exact files are available.
3. Add real PostgreSQL/Redis integration tests and a repeatable migration runner; then implement enrollment/session issuance, durable replay protection and idempotency with automated tests.
4. Build the Android–GPT transport bridge against a mock backend.
5. Integrate the original Cortana UI/persona only after backend and bridge gates pass.
