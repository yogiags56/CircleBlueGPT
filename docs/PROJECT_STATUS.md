# Project status

**Snapshot:** 2026-11-22  
**Current stage:** 004V-7 — isolated React Native 0.59.4 compatibility shell; API 28 runtime validation passed  
**Overall status:** legacy reverse-engineering, bridge prototypes and the isolated RN 0.59.4 runtime compatibility shell are validated by CI. Full Cortana UI/persona restoration and GPT-backed end-to-end conversation remain unimplemented.

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
- Initial Android run #202 (`44903707612`) failed Java compilation because `requestGeneration` was scoped inside a try block but referenced from its catch block. Fixed in commit `648643e822357e517e551076c33c88c73f7bd4a4`. Corrected Android run #209 (`44903854337`) completed successfully: 56/56 host-JVM tests, APK assembly and all 8/8 API 35 emulator instrumentation tests passed. Backend run #186 (`44903854393`) completed successfully with typecheck/build, migration idempotency and 41/41 PostgreSQL/Redis tests. Stage 004V-4 is complete.

### Stage 004V-4 Android artifact — run #209

- Artifact ID: `14706659543`; ZIP SHA-256: `17ce5f8d9f42f1ef85356edd7f741b6a63bd84192565bc6406e0cab1d99fa923`.
- App APK: 136,476 bytes; SHA-256 `45e1e5c00e69dab7d3289897737840b08a6728ec54135e378ccd9bbc06000b0b`.
- Instrumentation APK: 2,329,596 bytes; SHA-256 `ef10e54a3f245e97885c9b1f6486495258b8503094c8a83e07064a1117acc537`.
- ZIP and both APK archives passed integrity checks. Artifact expires 2026-12-05 per GitHub metadata.

## Stage 004V-5 Android bridge runtime facade (CI in progress)

- Added `AndroidBridgeRuntime` as the Android composition root for ChatHttpGateway, BridgeCore and LegacyConversationAdapter.
- Owns a single-thread background ExecutorService; network I/O never runs on the UI thread.
- Wires main-looper timeout scheduler and callback dispatcher; public listener callbacks are normalized onto the main looper.
- Exposes text query/manual input, conversation ID, cancel/reset/force-reset and explicit unsupported voice/card/skill behavior.
- `close()` is idempotent, cancels active conversation work before executor shutdown and rejects later calls with `BRIDGE_CLOSED`.
- Production constructor uses platform default TLS validation; injected custom connection factory is available for test-only certificate trust.
- Added API 35 instrumentation tests for runtime HTTPS round-trip, displayText mapping, main-thread delivery, active cancellation on close, closed-state rejection and conversation reset.
- Android run #233 (`44904515691`) completed successfully: 56/56 host-JVM tests, APK assembly and all 12/12 API 35 emulator instrumentation tests passed. Backend run #206 (`44904515583`) completed successfully with typecheck/build, migration idempotency and 41/41 PostgreSQL/Redis tests. Stage 004V-5 is complete.

### Stage 004V-5 Android runtime artifact — run #233

- Artifact ID: `14707482360`; ZIP SHA-256: `268d9e49be7bd9a4e9ad29112692d80096467d9c538c372c98f67bc961b97839`.
- App APK: 138,768 bytes; SHA-256 `bf8939263d4a6d5e6403579942b3ddae71164ac177e545cb190665592e0adb4e`.
- Instrumentation APK: 2,331,655 bytes; SHA-256 `21e2753de65e82657f717cf7b31660f9883149a9c48f865a3062a8324ed8f926`.
- ZIP and both APK archives passed integrity checks. Artifact expires 2026-12-05 per GitHub metadata.

## Stage 004V-6 React Native NativeModule compatibility audit (in progress)

- Static APK audit confirms legacy React Native bridge symbols: `ReactContextBaseJavaModule`, `ReactInstanceManager`, `ReactRootView`, `CatalystInstanceImpl`, `NativeModuleRegistry`, `JavaScriptExecutorFactory`, `JSCExecutor` and `DeviceEventManagerModule.RCTDeviceEventEmitter`.
- ARM64 and ARMv7 include `libreactnativejni.so`, `libjscexecutor.so` and `libjsc.so`; no `libhermes.so` was found.
- A TurboModule diagnostic string exists but does not prove TurboModule usage.
- Exact React Native semantic version was not exposed by APK metadata/strings. Do not guess the `react-android` version or compile against arbitrary RN.
- Audit and integration requirements are documented in `docs/legacy/REACT_NATIVE_BRIDGE_COMPATIBILITY.md`.
- Next: recover the original RN dependency version or pin it through class/native fingerprinting; then build a minimal isolated RN shell and verify no-op NativeModule registration/events before connecting AndroidBridgeRuntime.

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

### Stage 004V-6 — APK call-site audit refinement (2026-11-21)

- Re-inspected the supplied immutable Cortana 3.3.3.2876 APK; SHA-256 matches the recorded baseline.
- Bundle call sites confirm `NewmanViewManager.sendQuery(text, boolean)`, `onUserManualInput()` with no arguments as a text-input-focus notification, `cancelListening()`, `resetConversation()`, and a limited `forceResetConnection()` path.
- Corrected the adapter contract: manual-input focus is a no-op UI hook, not a query submission API.
- Bundle uses React Native NativeEventEmitter for Newman commute/CSDK state, query-text, response and error events. The MVP will not recreate unused commute/skill events.
- Inventory found 48 persona PERS assets (23 circle + 25 miantuan), 2,502,596 bytes total. GIF payloads/frame counts are decoded and validated; runtime state mapping remains pending.
- Exact React Native version remains unpinned; JSC/legacy bridge evidence is insufficient to select a Maven artifact.
- Three code commits correct the no-argument focus hook in LegacyConversationAdapter, its test, and AndroidBridgeRuntime. CI status must be checked before calling this change validated.

### Stage 004V-6 — full persona PERS inventory decoded (2026-11-21)

- Parsed all 48 PERS containers from the immutable reference APK (23 circle + 25 miantuan).
- Decoded embedded GIF payloads and verified all XML-declared frame counts against actual GIF frame counts: 1,846 total frames.
- Container bytes total 2,502,596; source GIF canvases are 100×116, 214×249 and 428×500.
- Added metadata-only inventory at `docs/legacy/CORTANA_PERSONA_ASSET_INVENTORY.md`; no extracted GIF payloads or APK binaries were committed.
- This complete 48-file inventory supersedes the earlier partial 15-segment/364-frame count as the total APK asset inventory. Persona state/timing/transition mapping is still pending.

### Stage 004V-6A — persona metadata catalog (2026-11-21)

- Added `PersonaAssetCatalog`, a metadata-only Java catalog for all 48 source PERS filenames.
- Catalog records family (circle/miantuan), filename expression token, original GIF canvas dimensions, frame count and PERS container byte size.
- Exposes immutable inventory, exact basename lookup, family/expression variant lookup, and aggregate frame/byte counts.
- Lookup rejects path components; catalog does not load or extract payloads, choose a runtime state, infer animation transitions, or alter the immutable source APK.
- Added six JVM tests for inventory totals (48 assets, 1,846 frames, 2,502,596 bytes), family counts, exact metadata, greeting variants, path traversal rejection and immutability.
- CI triggered by the code commits must pass before this slice is considered validated.
- React Native exact-version pinning remains blocked on original dependency metadata or class/native ABI fingerprinting; do not add an arbitrary RN dependency.

### Stage 004V-6B — React Native 0.59.4 fingerprint recovered (2026-11-21)

- Re-uploaded APK SHA-256 again matches the immutable reference baseline.
- Recovered exact JS package version from `assets/index.android.bundle`: Metro module 98 declares `{major:0, minor:59, patch:4, prerelease:null}`; exact object occurs once at byte offset 171,370.
- Metro module 97 reads `PlatformConstants.reactNativeVersion`, enabling native/JS parity verification during shell startup.
- RN target is **0.59.4**; the earlier claim that exact RN version was unknown is superseded.
- Added `docs/legacy/REACT_NATIVE_RUNTIME_FINGERPRINT.md` with evidence, native corroboration and reproducible verification.
- Do not add RN 0.59.4 directly to the current compileSdk 35 / Gradle 8.9 probe yet. Build an isolated legacy-compatible shell first; verify Maven resolution, native version parity, no-op NativeModule registration, Promise, event emitter and lifecycle.
- Native DEX confirms legacy Bridge APIs and Promise; ARM64/ARMv7 ship JSC and React Native JNI libraries. No Hermes library found.

### Stage 004V-6A validation — Android run #275 (2026-11-21)

- Android run #275 (`44911443963`) completed successfully on commit `6e3422d`: host-JVM unit-test task passed, debug and instrumentation APKs assembled, and all 12 API 35 emulator instrumentation tests completed successfully.
- Artifact #14710076733 (`cortanagpt-probe-apks.zip`) uploaded; ZIP SHA-256 `03cfc5d97179712845c99a4e78602df3b27ec7c8b3fb6f941809f6d3d29db1ad`.
- Backend run #240 (`44911443976`) also completed successfully.
- This validates the metadata catalog and corrected 23/25 family counts. It does not validate the separate RN 0.59.4 compatibility shell, which has not yet been created.

### Stage 004V-7 — isolated React Native 0.59.4 compatibility shell (2026-11-22)

- Added `android/rn0594-compat/`, separate from the modern AGP 8.7.3 / compileSdk 35 probe.
- Direct JavaScript dependencies are pinned to React 16.8.3 and React Native 0.59.4. Android build target is AGP 3.3.1, Gradle 4.10.1, compileSdk/build-tools 28, minSdk 19, targetSdk 28, JDK 8.
- Added ReactActivity/ReactNativeHost bootstrap and a legacy ReactPackage with a no-op `ReactContextBaseJavaModule`.
- Probe exposes Promise resolve/reject and DeviceEventManagerModule event delivery. JS checks native `PlatformConstants.reactNativeVersion` for exact 0.59.4 parity.
- Added `.github/workflows/rn0594-compat.yml` to install JS dependencies, generate a bundle, assemble APK and launch on API 28 emulator; CI requires version parity, Promise resolve/reject and event delivery markers.
- Corrected package API to the post-0.47 ReactPackage contract (no `createJSModules()` method).
- This is a scaffold only: no Actions result has yet been observed for the new workflow, and no local build has been run. Transitive npm dependencies are not yet captured in a committed lockfile; lockfile/reproducibility hardening remains open.
- Do not call RN 0.59.4 native parity or NativeModule integration validated until the API 28 emulator workflow passes.

### Stage 004V-7 CI iteration 1 — SDK/JDK mismatch corrected (2026-11-22)

- First workflow run #15 (`44934215889`) failed before SDK installation or project compilation. Log evidence: `android-actions/setup-android@v4` downloaded command-line tools 22.0, which requires JDK 17, while the job had already switched to JDK 8 for Gradle 4.10.1.
- Corrected workflow order: JDK 17 for Android SDK setup and SDK package installation, then switch to JDK 8 immediately before the legacy Gradle build.
- This is an environment bootstrap failure, not evidence of a React Native or Java source compile failure. Re-run status is pending; no APK or runtime validation yet.

### Stage 004V-7 CI iteration 2 — Metro Babel preset correction (2026-11-22)

- After fixing the SDK/JDK ordering, workflow run #20 (`44934341325`) passed Android SDK setup, SDK 28 package installation, JDK 8 switch and npm dependency installation.
- JS bundle generation then failed parsing Flow syntax in React Native's `Libraries/Blob/URL.js` (`Unexpected token ... expected ','`). This isolated the next issue to missing project Babel preset configuration, before Android compilation.
- Added `android/rn0594-compat/.babelrc` selecting `module:metro-react-native-babel-preset`, matching the legacy Metro transformer setup.
- Next workflow attempt must confirm bundle generation before Gradle compile and API 28 runtime tests. Native compatibility remains unvalidated.

### Stage 004V-7 CI iteration 3 — Babel traversal pin (2026-11-22)

- Workflow run #24 (`44934502675`) passed SDK/JDK setup and dependency installation, but Metro still failed parsing Flow syntax in RN `Libraries/Blob/URL.js`.
- Investigation of the exact failure pattern identifies the known old Metro Babel preset / modern Babel traversal incompatibility (Flow method parameter annotations are parsed as ordinary JS after a Babel traversal regression).
- The first Yarn attempt (run #29, `44934669969`) failed dependency installation because modern transitive packages declare Node >=18/20 and the workflow was still on Node 10. The run did not reach bundling.
- Replaced the broad Babel traversal resolutions with a targeted Yarn resolution of `metro-react-native-babel-preset 0.59.0`, the Flow-parser fix used by later RN releases, while keeping React Native itself pinned at 0.59.4.
- Switched the Metro build host to Node 20 to satisfy current transitive package engine declarations; Gradle remains on JDK 8 after Android SDK setup under JDK 17.
- Added a lockfile gate: generated `yarn.lock` must be committed after the first successful dependency resolution to freeze all transitive packages.
- Next run must prove the Metro bundle passes. Android compilation and emulator validation remain pending.

### Stage 004V-7 CI iteration 4 — explicit Babel core peer dependency (2026-11-22)

- Workflow run #37 (`44934828118`) passed SDK/JDK setup and Yarn dependency installation with Node 20.
- Metro then failed at bundle startup with `Cannot read properties of undefined (reading 'transformFile')`. Yarn output showed the Metro transformer and preset peer dependencies were missing `@babel/core`.
- Added explicit build dependencies `@babel/core 7.16.5` and `metro-react-native-babel-preset 0.59.0`, keeping the React Native runtime dependency itself at 0.59.4.
- Next run must validate bundle generation; Gradle compile and API 28 emulator bridge checks remain pending.

### Stage 004V-7 CI iteration 5 — legacy Metro Node runtime (2026-11-22)

- Workflow run #45 (`44934939862`) passed SDK/JDK setup and Yarn install after explicitly adding Babel core and Metro preset dependencies.
- Metro still failed with `Cannot read properties of undefined (reading 'transformFile')`. This is a secondary symptom of the Metro transformer failing during initialization; current Metro guidance and issue reports associate this symptom with using a Node runtime too new for an older Metro stack.
- Changed the compatibility workflow from Node 20 to Node 16.20.2, and enabled Yarn `--ignore-engines` so newer metadata/transitive packages do not block installation solely on declared engine ranges. Gradle remains JDK 8; Android SDK tools remain JDK 17.
- React Native remains 0.59.4; Metro preset 0.59.0 and Babel core 7.16.5 are build-only adjustments. Next run must verify Metro startup and bundle completion.

### Stage 004V-7 CI iteration 6 — APK compile passed; emulator JDK corrected (2026-11-22)

- Workflow run #48 (`44935062656`) successfully generated the RN 0.59.4 JS bundle and assembled the compatibility debug APK using AGP 3.3.1 / Gradle 4.10.1 / JDK 8.
- API 28 emulator step then failed before launch because the emulator action's Android SDK tools were executed under JDK 8. The log reports `UnsupportedClassVersionError` for class-file version 55 (JDK 11+) while current Java was class-file version 52 (JDK 8); Android command-line tools require JDK 17 in this environment.
- Added a JDK 17 switch after APK assembly and before emulator startup. The legacy Gradle build remains on JDK 8; emulator/SDK tools run on JDK 17.
- APK assembly is now validated; NativeModule runtime, version parity, Promise and event delivery remain pending emulator verification.

### Stage 004V-7 runtime bootstrap hardening — SoLoader (2026-11-22)

- Added the RN-era `SoLoader.init(this, false)` call in `MainApplication.onCreate()` before the React Native host is first used. This is part of the standard legacy Android bootstrap and is required before native RN libraries are loaded.
- Workflow run #54 (`44935272285`) has already passed JS bundle generation and APK assembly; its API 28 emulator gate is still running at last check. That run predates the SoLoader change. Workflow run #57 (`44935575432`) includes the SoLoader correction and is in progress.
- Runtime verification remains gated on API 28 logs for native version parity, Promise resolve/reject and event delivery.

## Stage 004V-7 — RN 0.59.4 runtime compatibility validated (2026-11-22)

- Isolated compatibility shell: `android/rn0594-compat/`; it does not downgrade or replace the modern Android probe toolchain.
- GitHub Actions run #16 (`44998947302`) completed successfully on branch `stage-004r/bootstrap`, commit `9cec35c89a49fa62872b9225870a2668a010c149`.
- Workflow completed the legacy dependency install, Metro bundle generation, APK assembly, API 28 emulator launch, bridge smoke test and APK artifact upload.
- The smoke-test gate requires all four runtime markers: native React Native version parity (0.59.4), NativeModule Promise resolve, Promise rejection, and DeviceEventManagerModule event delivery. A successful job means all required markers were observed.
- The separate modern Android probe run #18 (`44998951982`) also completed successfully: host-JVM compatibility policy tests, APK assembly, API 35 emulator instrumentation and artifact upload passed.
- Backend CI run #19 (`44998952019`) completed successfully; 41/41 backend tests passed.
- Follow-up run #17 (`44998951927`) also reached successful API 28 smoke test and artifact upload; its Actions job was still completing post-job cleanup at the time of inspection. Run #16 is the completed canonical evidence.
- Run links: https://github.com/yogiags56/CircleBlueGPT/actions/runs/44998947302 ; https://github.com/yogiags56/CircleBlueGPT/actions/runs/44998951982 ; https://github.com/yogiags56/CircleBlueGPT/actions/runs/44998952019
- **Scope limitation:** this validates a minimal isolated RN 0.59.4 Android shell and a test NativeModule. It does not yet validate the original Cortana React Native bundle, Newman bridge implementation, persona renderer, Microsoft service replacement, or a GPT-backed conversation.
- **Reproducibility:** android/rn0594-compat/yarn.lock is now committed; CI installs with --frozen-lockfile. The frozen-lockfile build and API 28 smoke test passed in run #45000494436.

### Next implementation slice — 004V-8

1. Capture the exact resolved Yarn dependency graph as a committed `yarn.lock`; change CI to install with `--frozen-lockfile`.
2. Add an adapter contract test around the verified RN 0.59.4 bridge, then integrate the existing `AndroidBridgeRuntime` into the RN shell through a narrowly scoped NativeModule.
3. Keep the original `sendQuery(text, boolean)` boolean semantics unresolved until the original bundle behavior is proven; do not infer it.
4. Preserve the existing `onUserManualInput()` no-argument focus hook and the text-only MVP boundary.
5. Begin Cortana UI/persona restoration only after the bridge adapter lifecycle and event behavior are validated. Keep proprietary PERS payloads and the original APK out of Git.


## 004V-8 — initial RN bridge integration in CI validation (2026-11-22)

- Committed the resolved Yarn lockfile and enabled frozen installs. Run #45000494436 passed dependency install, JS bundle, APK assembly, API 28 bridge smoke test and APK artifact upload.
- Added CortanaBridgeModule and CortanaBridgePackage in the RN 0.59.4 shell, registering a text-only API over the validated AndroidBridgeRuntime.
- Copied the bridge runtime, dispatcher, timeout scheduler, BridgeCore, HTTPS gateway, protocol codec, DTOs and legacy conversation adapter into the isolated shell; added Gson 2.11.0.
- Added HTTPS-only network policy, an empty endpoint resource that fails closed, and lifecycle teardown.
- JS smoke test now checks that CortanaBridge is registered and reports endpoint-not-configured; it makes no network call.
- New integration CI is queued at run #45001227289. The new module has not yet passed compilation/emulator validation.
- This is a native adapter integration, not a live GPT conversation. Endpoint configuration, backend contract interoperability, real device/network test, memory selection, and legacy sendQuery(text, boolean) semantics remain open.


## Runtime evidence and additional fail-closed checks (2026-11-22)

- RN compatibility run #45001282960 completed successfully. Its emulator log contains all required markers, including `CORTANA_BRIDGE_MODULE_OK:endpoint-not-configured`, proving the new Cortana NativeModule is registered and callable in RN 0.59.4.
- The same run also observed native PlatformConstants 0.59.4, Promise resolve/reject behavior and event delivery.
- Android probe run #45001282289 passed API 35 instrumentation; backend CI run #45001282287 passed typecheck, migration/idempotency verification, infrastructure integration tests and build.
- A second hardening pass added explicit Android URI validation for HTTPS endpoint configuration and expanded RN emulator assertions: `sendText()` must fail closed when no endpoint is configured; idle cancellation must return false; idle reset must resolve; the legacy no-argument focus notification must remain safe.
- New CI runs #45012904259 (latest RN smoke with the expanded assertions), #45012901196 (Android probe), and #45012901151 (backend) are still in progress at this checkpoint. Do not claim these additional assertions passed until their run logs show the markers.
- The endpoint remains intentionally unset. There is no live chat endpoint, provider integration, session authentication, or end-to-end GPT response yet.


## 004V-9 — proposal-only CortanaPoP verifier primitive (2026-11-22)

- Added route-independent `verifyCortanaPopProof()` in `backend/server/src/security/cortana-pop.ts`.
- Canonical verification binds uppercase HTTP method, exact origin-form path+query, SHA-256 of exact raw body bytes, timestamp, proof JTI and SHA-256 of access token; signature uses the existing P-256 SHA-256 verifier.
- Rejects malformed method/target/timestamp/JTI/token, timestamp outside configured skew, and invalid signatures. Added positive and negative test vectors using ephemeral test-only ECDSA keys.
- Backend CI run #45055266720 passed TypeScript typecheck, build, PostgreSQL migrations/idempotency verification and **47/47 tests** (six new CortanaPoP verifier tests included).
- The verifier is deliberately not wired to any HTTP route. It does not itself authenticate tokens, enforce scopes, claim replay IDs, or capture trusted raw request bytes. Public integration remains blocked on independent protocol review, canonicalization interoperability vectors, and full route-level authorization/replay/idempotency tests.
- The protocol remains custom proposal-only CortanaPoP, not RFC 9449 DPoP. No public API, provider integration or live chat endpoint has been deployed.
- Latest Android probe and RN compatibility CI on this code commit are still running; see Actions for current status.
