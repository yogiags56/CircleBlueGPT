# Project status

**Snapshot:** 2026-11-21  
**Current stage:** 004V-4 — legacy conversation adapter for NewmanViewModule; transport client and protocol codec validated  
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
- Latest Android probe workflow run #120 (`44900668260`) completed successfully: 4 Keystore policy tests + 16 BridgeCore JVM tests, APK assembly and all 5 API 35 emulator instrumentation tests passed.
- Latest probe artifact ID `14705197305` from run #94; ZIP SHA-256 `df04f08ccf8aedb6b72a18b4266d6fe14b0c1aa979113971690de94304e20a88`. ZIP integrity verified; app APK 14,972 bytes (SHA-256 `13b4969587bc339407b16607b774c8db008ddbef703abf38b5d6a0ea6a537d73`) and instrumentation APK 1,679,113 bytes (SHA-256 `987102da35bc864a618e50cc2dc8d2be2d581947bdfe711e7a3647413d5cd807`).

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
- Backend CI run #119 (`44900668259`) passed strict TypeScript typecheck/build, both migration passes and **41/41 tests** against PostgreSQL/Redis services. Earlier successful backend run #99 is historical baseline. This run includes the CortanaPoP naming and test assertion update. The tests include challenge single-use/expiry/purpose isolation, P-256 signature and off-curve rejection, Redis replay concurrency, idempotency and session-token hash/authentication/expiry/rotation/revocation behavior.
- These are repository-level primitives and health routes only. No public enrollment/authentication/rotation/revocation/chat endpoints, CortanaPoP verification middleware, provider adapter or production deployment exists. Backend CI run #99 (`44899189694`) passed strict TypeScript typecheck/build, migration idempotency and 41/41 tests against PostgreSQL/Redis services. The custom CortanaPoP proof-of-possession protocol has not received independent cryptographic review.
- No exactly-once external provider execution is claimed; idempotency is not yet connected to a chat/provider orchestration route.

## Stage 004V bridge core (implemented; lifecycle hardening next)

- Added platform-neutral Java `ChatRequest`, `ChatResponse` and `BridgeCore` under `android/probe/app/src/main/java/com/cortanagpt/probe/bridge/`.
- Request DTO enforces text-only input, a bounded selected-memory list (10 items; 2,048 characters per item; 8,192 total) and request/conversation ID validation.
- Response DTO accepts only nonempty bounded text and a matching request ID; provider metadata and action/tool payloads are excluded.
- BridgeCore arbitrates one terminal success/failure/cancellation callback, rejects duplicate active request IDs and ignores late gateway callbacks after cancellation. Gateway is injected; no HTTP/auth/provider endpoint is wired.
- Eight JVM bridge tests were added for DTO validation, immutable memory, success/failure, mismatched IDs, cancellation races, duplicate IDs, synchronous callbacks and generic error handling.
- Initial Android CI run `44899084557` exposed a faulty aggregate-memory test fixture (one item exceeded the per-item cap); the fixture was corrected to five individually valid 1,700-character items.
- Corrected Android run #94 (`44899189690`) completed successfully: 4 Keystore policy tests + 8 bridge JVM tests passed, APK assembly succeeded, and all 3 API 35 emulator instrumentation tests passed.
- Listener callbacks are not marshalled to Android's main thread; the future Android UI adapter must dispatch them appropriately. No React Native NativeModule, streaming, event buffering, HTTP transport, timeout or production endpoint is implemented.

## Stage 004V-2 lifecycle hardening (CI in progress)

- `BridgeCore` now receives an injected `TimeoutScheduler`, `CallbackDispatcher` and positive timeout duration. Timeout, success, generic failure and cancellation compete through one terminal-state gate.
- Timeout handles are cancelled after any terminal result. If timeout/cancellation wins before `Gateway.send` returns its call handle, the late handle is cancelled immediately.
- Listener callbacks are dispatched outside the internal lock. Listener and dispatcher runtime exceptions are contained.
- Added Android adapters: `AndroidMainThreadDispatcher` and `MainLooperTimeoutScheduler`. The timeout adapter uses the main looper; a blocked UI thread can delay timeout delivery, and network I/O must never run on that looper.
- Expanded JVM bridge tests for timeout/success/cancel races, cancel-before-handle-return, timeout-before-handle-return, deferred dispatch, listener/dispatcher exceptions and scheduler failure.
- Added API 35 instrumentation tests for Android main-looper dispatch and timeout delivery.
- Android run #120 (`44900668260`) completed successfully: 20 host-JVM tests passed, APK assembly succeeded, and all 5 API 35 emulator instrumentation tests passed. Artifact #14706200956 was downloaded; ZIP and both APK archives passed integrity checks and their SHA-256 values were recorded above.
- Latest backend run #119 (`44900668259`) completed typecheck/build, migration idempotency and 41/41 PostgreSQL/Redis tests successfully.

## Stage 004V-3 local/mock HTTPS gateway (in progress)

- Added `ChatProtocolCodec` for the proposed v1 request/response contract. It rejects duplicate/unknown fields, unsupported versions, mismatched request IDs, empty/oversized text, malformed/trailing JSON and invalid UTF-8.
- Bounds: 64 KiB encoded request, 256 KiB response body, 65,536 response-text characters.
- Added `ChatHttpGateway` with injected endpoint, background Executor and HTTPS connection factory. Default factory uses platform HTTPS/TLS certificate validation.
- Transport sets connect/read timeouts, fixed-length POST, Content-Type/Accept/Idempotency-Key, disables redirects and accepts only HTTP 200. Both Content-Length and streaming reads are bounded.
- Cancellation/completion use one atomic state; cancellation disconnects active connection best-effort and suppresses late callbacks.
- No auth header/session token, production URL, provider key, retry or backend chat endpoint is included. Executor must be background; network I/O must not run on main thread.
- Android run #152 (`44901611627`) found 1 failing JVM test among 37: strict Gson reader reported extra top-level JSON as malformed rather than the expected trailing-data code. Corrected in commit `6e46c5a0d2b5c0ab3eac851d74720e9c7c70f30b`.
- Corrected Android run #154 (`44901777496`) completed successfully: all 37 host-JVM tests passed, APK assembly succeeded, and all 5 API 35 emulator instrumentation tests passed. Artifact #14706586070 was downloaded; ZIP and both APK archives passed integrity checks and hashes are recorded below.
- Backend run #142 (`44901777488`) passed strict typecheck/build, migration idempotency and 41/41 PostgreSQL/Redis tests.

### Latest Stage 004V-3 Android artifact — run #154

- Artifact ID: `14706586070`; ZIP SHA-256: `50e1856ff4100aa666d0c1162afc9f3b11e0ee970b08e36e5e11f0f458fcaa2e`.
- App APK: 133,948 bytes; SHA-256 `4c33365fc23294495fa87aa4504350d05887d48c5b2299bd95e5a295a273fc04`.
- Instrumentation APK: 1,679,317 bytes; SHA-256 `217d27bbc81b425f9a7ad483316930c96900fff0d879967799d8411186354c31`.
- ZIP and both APK archives passed integrity checks. Artifact retention expires 2026-12-05 per GitHub metadata.

## Stage 004V-3B real local HTTPS mock-server integration (CI in progress)

- Added test-only dependencies `okhttp3:mockwebserver:4.12.0` and `okhttp3:okhttp-tls:4.12.0`.
- Added `ChatHttpGatewayTlsIntegrationTest` using a generated local test certificate and a trust configuration limited to that certificate.
- Tests cover a real TLS handshake and POST round-trip, request path/headers/body, redirect rejection, HTTP 503 generic failure, delayed-body read timeout, oversized body, in-flight cancellation, and rejection of an untrusted self-signed certificate by the platform default trust store.
- This is a test-only TLS trust configuration; production default factory still uses platform certificate validation.
- Android run #167 (`44902414304`) completed successfully: 44/44 host-JVM tests, APK assembly and all 5/5 API 35 emulator instrumentation tests passed. Backend run #153 (`44902414337`) passed strict typecheck/build, migration idempotency and 41/41 tests. Stage 004V-3B is complete; the host JVM suite exercised real local TLS sockets using a test-only trust certificate.

### Stage 004V-3B artifact — Android run #167

- Artifact ID: `14706248982`; ZIP SHA-256: `cc1885e9bd1c48c6242c6f5d52e7acaa0a22746a13735884d5808314af67ac92`.
- App APK: 133,950 bytes; SHA-256 `4c9b707f393eca328cea23801791941feb2f3fa5b83fe39f6e3397888b9e2451`.
- Instrumentation APK: 1,679,316 bytes; SHA-256 `707f2bcb46e160c24f98b8d4c5f798f6fbdcf45418a5cce92003dff6afa27929`.
- ZIP and both APK archives passed integrity checks. Artifact expires 2026-12-05 per GitHub metadata.

## Stage 004V-3C Android runtime HTTPS verification (CI in progress)

- Added `ChatHttpGatewayAndroidTlsTest` under `androidTest`; uses local MockWebServer and a generated test certificate trusted only by the test client.
- Exercises the actual Android `HttpsURLConnection` path through BridgeCore, including TLS round-trip, main-looper callback delivery, redirect rejection and cancellation during response read.
- Test-only certificate trust is scoped to the test connection factory; production/default HTTPS trust is unchanged.
- Android run #181 (`44902907961`) completed successfully: 44/44 host-JVM tests, APK assembly and all 8/8 API 35 emulator instrumentation tests passed. Backend run #165 (`44902907996`) passed strict typecheck/build, migration idempotency and 41/41 PostgreSQL/Redis tests. Stage 004V-3C is complete.

### Stage 004V-3C Android runtime artifact — run #181

- Artifact ID: `14706378878`; ZIP SHA-256: `6b779b0a1919190a13cd148b7c039071f2aebc0c57206514d60d8d50415d0853`.
- App APK: 133,949 bytes; SHA-256 `5a0aeed042f48bf1a8f87e66729a81fa19aa121afdabfbccd53bc361ba2209ce`.
- Instrumentation APK: 2,329,598 bytes; SHA-256 `99e17a3270cef8038814856cff1f4557bcebcc523d74381452c273a95c6db903`.
- ZIP and both APK archives passed integrity checks. Artifact expires 2026-12-05 per GitHub metadata.

## Stage 004V-4 legacy conversation adapter (CI in progress)

- Added platform-neutral `LegacyConversationAdapter` for the statically mapped NewmanViewModule surface.
- Maps `sendQuery` and `onUserManualInput` to validated ChatRequest submissions with only selected memory context.
- Maps validated assistant text into the narrow legacy `view.displayText` response shape.
- Maps cancel/reset/force-reset locally; request replacement and generation checks suppress stale responses.
- Voice input, adaptive-card submission and legacy skill events return explicit unsupported errors in the text-only MVP.
- Adapter serializes submit/cancel/reset transitions to avoid orphan requests during concurrent/reentrant callbacks; listener notifications occur outside its state locks.
- Added 12 deterministic JVM tests for response mapping, memory selection, invalid input, cancellation/reset, replacement, reentrant callbacks, stale response suppression and unsupported legacy actions.
- Initial Android run #202 (`44903707612`) failed Java compilation because `requestGeneration` was scoped inside a try block but referenced from its catch block. Fixed in commit `648643e822357e517e551076c33c88c73f7bd4a4`. Corrected Android run #209 (`44903854337`) and backend run #186 (`44903854393`) are in progress. Do not mark 004V-4 complete until Android host-JVM, APK assembly and API 35 instrumentation all pass.

## Security and release constraints

- Keep provider credentials exclusively on the backend; never embed provider API keys in the APK.
- Keep the original Cortana APK immutable and out of Git.
- Keep the working branch and draft PR separate from `main` until explicit approval.
- Local memory must remain encrypted and user-controllable; only selected relevant context should be sent to the backend.

## Next objectives

1. Review the proposed Stage 004T protocol and threat model; obtain independent cryptographic review before implementation.
2. Promote and validate the platform-neutral BridgeCore, AES-GCM codec and HTTP transport source/tests from the recovery workspace when the exact files are available.
3. Obtain independent cryptographic review of the custom CortanaPoP proof-of-possession protocol before composing the tested challenge, P-256, replay and token primitives into public enrollment/session endpoints. The repository-level session-token tests have passed 41/41 in CI.
4. Complete API 35 emulator validation for Stage 004V-2 timeout/dispatcher adapters.
5. Implement a narrow legacy conversation adapter matching NewmanViewModule text-query semantics and map validated GPT text into `view.displayText`.
6. Add deterministic adapter tests for text submission, reset/cancel, duplicate events and unsupported legacy skills.
7. Integrate the original Cortana UI/persona only after backend and bridge gates pass.
