# CortanaGPT — Recovery Checkpoint

**Checkpoint date:** 2026-11-21  
**Project:** CortanaGPT / CircleBlueGPT  
**Repository:** https://github.com/yogiags56/CircleBlueGPT  
**Working branch:** `stage-004r/bootstrap`  
**Pull request:** #1 — draft, targets `main`  
**Current milestone:** Stage 004V — platform-neutral bridge core  
**Checkpoint status:** durable handoff; continue from this file and the current branch HEAD.

> Recovery rule: when a conversation is interrupted, first read this file, then inspect the current branch HEAD and the latest GitHub Actions runs. Do not infer progress from chat history alone. Treat the repository and CI evidence as authoritative.

> **Latest dated checkpoint:** [2026-11-21 — Stage 004V](docs/checkpoints/2026-11-21-stage-004v.md). Detailed checkpoint latest update commit: `9b120f8d383975f888811d997ef31d25376f80fb`. This dated record includes verified Android run #94, backend run #99, current limitations, and explicit next steps for lifecycle hardening. Read it after this root index when resuming.

**Current verified state (2026-11-21):** Android run #94 (`44899189690`) passed 12 JVM tests, APK assembly and 3 API 35 instrumentation tests; backend run #99 (`44899189694`) passed 41/41 tests. Stage 004V-2 is complete: injectable timeout scheduler, callback dispatcher, Android main-looper adapters and lifecycle/race tests. Android run #120 (`44900668260`) passed 20 host-JVM tests, APK assembly and all 5 API 35 emulator instrumentation tests. Artifact #14706200956 and ZIP/APK SHA-256 hashes are recorded in the detailed checkpoint. Backend run #119 (`44900668259`) passed 41/41 tests. Next: Stage 004V-3 local mock-gateway transport/integration. The root checkpoint, detailed checkpoint, project status and roadmap were synchronized on 2026-11-21. These documentation commits do not represent new product/test results. Stage 004V-2 has passed its recorded CI run. Check the latest branch and CI before further work.

## 1. Project intent and non-negotiable decisions

Restore the original Cortana Android experience with Cortana's identity, personality, UI and blue-ring persona preserved, while replacing the retired Microsoft service/authentication boundary with a modern GPT-backed service.

- Motto: **“A New Mind, The Same Cortana.”**
- Android-first; original Cortana APK is immutable forensic input, not a build artifact.
- Zero-login UX is the goal. Device/session enrollment should happen automatically after the protocol is reviewed and implemented.
- Provider credentials and GPT API keys stay on the backend. Never embed them in the APK.
- Local memory should be encrypted and user-controllable; send only selected relevant context.
- Restore functionality before visual redesign; preserve persona and blue-ring animation.
- Do not reuse Microsoft/Bing tokens, headers, legacy CSDK authentication or old endpoints.
- Keep this work on `stage-004r/bootstrap`; do not merge PR #1 or change `main` without explicit user approval.

## 2. Source baseline and original APK

- Original package: `com.microsoft.cortana`, version 3.3.3.2876, en-us.
- min API 19; target API 29; ARM64 and ARMv7.
- Original APK SHA-256: `c8c3192bc29057dfc398f4cb8fa3bfc549422373e0688a4c6de993f37a233d6c`.
- Original APK must remain unchanged and excluded from Git.
- Static audit mapped `LauncherScene`, startup/auth dependency, `NewmanViewModule`, `PersonaManager`, `NativeCortana`, and the minimum `view.displayText` response contract.
- 15 persona GIF segments (364 frames, 100×116) were extracted from four PERS containers; they have not been reintegrated.
- Static analysis is not proof that the original app can be rebuilt or run against a modern backend.

## 3. Verified Android probe and CI evidence

**Latest verified Android run:** #94, run ID `44899189690`.

- 4 Keystore/API-policy JVM tests passed.
- 8 BridgeCore JVM tests passed.
- APK assembly succeeded.
- API 35 emulator instrumentation: 3/3 passed (ciphertext round-trip, deleted-key invalidation, session destruction).
- Artifact ID: `14705197305`.
- Artifact ZIP SHA-256: `df04f08ccf8aedb6b72a18b4266d6fe14b0c1aa979113971690de94304e20a88`.
- App APK: 14,972 bytes; SHA-256 `13b4969587bc339407b16607b774c8db008ddbef703abf38b5d6a0ea6a537d73`.
- Instrumentation APK: 1,679,113 bytes; SHA-256 `987102da35bc864a618e50cc2dc8d2be2d581947bdfe711e7a3647413d5cd807`.
- Run link: https://github.com/yogiags56/CircleBlueGPT/actions/runs/44899189690

The API 19–22 compatibility rule is tested as a pure-Java policy for API 19, 22, 23 and 35. It has **not** been validated by running on API 19–22 Android emulators/devices. Do not claim otherwise.

The APK above is the **probe**, not a restored Cortana APK.

## 4. Backend and protocol evidence

**Latest verified backend run:** #99, run ID `44899189694`.

- Strict TypeScript typecheck/build passed.
- PostgreSQL migration idempotency checks passed.
- 41/41 tests passed against PostgreSQL and Redis services.
- Run link: https://github.com/yogiags56/CircleBlueGPT/actions/runs/44899189694

Implemented backend primitives include Fastify/TypeScript scaffold, PostgreSQL migrations, Redis wiring, durable idempotency repository, P-256 public-JWK validation and signature verification, Redis proof replay guard, single-use enrollment challenge repository, and hashed opaque session-token repository.

**Security gate:** the custom scheme is named `CortanaPoP` (`Authorization: CortanaPoP`, `X-Cortana-Proof`). It is not RFC 9449 DPoP and must not be represented as standards-interoperable. It has not received independent cryptographic review. Challenge consumption currently occurs before signature verification, so a failed proof burns that challenge.

These are repository primitives and tests only:
- No public enrollment, authentication, rotation, revocation or chat endpoint exists.
- No CortanaPoP request-verification middleware exists.
- No GPT provider adapter or production deployment exists.
- Idempotency is not connected to external provider execution; no exactly-once provider execution is claimed.

## 5. Stage 004V — code already committed

Java sources:
- `android/probe/app/src/main/java/com/cortanagpt/probe/bridge/ChatRequest.java`
- `android/probe/app/src/main/java/com/cortanagpt/probe/bridge/ChatResponse.java`
- `android/probe/app/src/main/java/com/cortanagpt/probe/bridge/BridgeCore.java`

Tests:
- `android/probe/app/src/test/java/com/cortanagpt/probe/BridgeCoreTest.java`

Behavior:
- Request validates text, request/conversation IDs, selected-memory item count and aggregate size.
- Response validates nonempty bounded text and request ID.
- BridgeCore rejects duplicate active request IDs, arbitrates a single terminal success/failure/cancel result, and ignores late callbacks after cancellation.
- Gateway is injected as an interface. No HTTP, authentication or provider implementation is wired.

Known limitations:
- Listener callbacks run on the gateway/caller thread; there is no Android main-thread dispatcher.
- No timeout, streaming, bounded event buffer or transport cancellation endpoint is implemented.
- This is not a React Native NativeModule.
- The current probe UI does not render the original Cortana shell or persona.

## 6. Next work — continue in this order

### 004V.1 — lifecycle hardening
1. Add an injectable callback dispatcher so Android UI callbacks can be marshalled to the main thread without making the core Android-dependent.
2. Add deterministic timeout handling with an injectable scheduler/clock; avoid real sleeps in tests.
3. Ensure timeout, cancellation, synchronous gateway completion and late callbacks still produce exactly one terminal callback.
4. Add tests for timeout-vs-success, timeout-vs-cancel, cancellation before gateway call returns, dispatcher behavior and listener exceptions.
5. Re-run Android CI; update this checkpoint with exact run IDs and results.

### 004V.2 — local mock gateway
1. Add a deterministic mock gateway and a local/mock HTTPS transport contract.
2. Validate bounded response parsing, request ID matching, generic errors, timeouts, cancellation and request-size limits.
3. Keep production URL and credentials absent.
4. Do not claim the backend chat endpoint exists until it is implemented and tested.

### 004W — Cortana shell integration assessment
1. Follow `docs/legacy/CORTANA_SHELL_RESTORATION_MAP.md`.
2. Preserve persona rendering as a UI concern, independent of network/auth state.
3. Replace only the service/auth boundary; disable legacy skills/actions in MVP.
4. Keep voice input later; MVP is text-only.
5. No original APK patching until the isolated restoration shell and bridge pass emulator validation.

### 004T protocol gate remains open
Obtain independent cryptographic review before exposing public anonymous-session endpoints or integrating the custom CortanaPoP scheme into a production client.

## 7. Recovery procedure for a new or repaired conversation

1. Open this file: `CHECKPOINT.md`.
2. Inspect current branch `stage-004r/bootstrap` and latest commit; the branch may have advanced since this checkpoint was written.
3. Inspect PR #1 and latest Actions runs. Use current run results, not stale run IDs copied from older messages.
4. Read `docs/PROJECT_STATUS.md`, `docs/roadmap/STAGES.md`, `bridge/README.md` and `docs/legacy/CORTANA_SHELL_RESTORATION_MAP.md`.
5. Check whether any listed “next work” has already been completed after this checkpoint before implementing it again.
6. Continue only on the working branch. Preserve all security/release constraints above.
7. At the end of every meaningful work unit, update this checkpoint and status/roadmap, record exact commit and CI evidence, and leave a concise handoff.

## 8. Useful links

- Repository: https://github.com/yogiags56/CircleBlueGPT
- Draft PR #1: https://github.com/yogiags56/CircleBlueGPT/pull/1
- Android CI #94: https://github.com/yogiags56/CircleBlueGPT/actions/runs/44899189690
- Backend CI #99: https://github.com/yogiags56/CircleBlueGPT/actions/runs/44899189694
- Bridge contract: `bridge/README.md`
- Project status: `docs/PROJECT_STATUS.md`
- Roadmap: `docs/roadmap/STAGES.md`
- Cortana shell map: `docs/legacy/CORTANA_SHELL_RESTORATION_MAP.md`

## Latest continuation — Cortana APK call-site refinement (2026-11-21)

The newly supplied Cortana 3.3.3.2876 APK was re-inspected as immutable input; SHA-256 matches the recorded baseline. Its JS bundle confirms `NewmanViewManager` call sites: `sendQuery(text, boolean)` (boolean meaning unresolved), no-argument `onUserManualInput()` focus hook, `cancelListening()`, `resetConversation()`, and a narrow `forceResetConnection()` path. Corrected `LegacyConversationAdapter`, its unit test and `AndroidBridgeRuntime` so manual-input focus is a no-op UI hook and never submits text. Inventory: 48 PERS persona files, 23 circle + 25 miantuan, 2,502,596 bytes; embedded GIF frame counts are decoded and validated, while runtime state mapping remains pending. Exact RN version remains unknown and must not be guessed.

Latest implementation commits: `2960f4b`, `1110583`, `1e29bed`; documentation commits: `8c0886a`, `7445928`, `891b9d1`, `fc7920e`. Latest CI for these commits is not yet verified. Resume by checking Android workflow, tracing the sendQuery boolean/Promise contract, pinning RN through ABI evidence, then build an isolated no-op NativeModule shell. Do not patch original APK or merge PR #1/main.

## Persona asset inventory — 48 PERS files (2026-11-21)

The original APK's 48 PERS containers were inspected; all embedded GIF payloads decoded and frame counts matched XML metadata: 1,846 frames total, 2,502,596 container bytes, canvas sizes 100×116, 214×249 and 428×500. Full metadata table: `docs/legacy/CORTANA_PERSONA_ASSET_INVENTORY.md`. This complete inventory supersedes the earlier partial 15-segment/364-frame extraction count as the total APK asset count. No extracted proprietary GIFs or APK binaries were committed. Persona state/timing/transition mapping remains pending.

## Persona metadata catalog implementation — Stage 004V-6A (2026-11-21)

Added `android/probe/app/src/main/java/com/cortanagpt/probe/persona/PersonaAssetCatalog.java` and `android/probe/app/src/test/java/com/cortanagpt/probe/PersonaAssetCatalogTest.java`. The catalog indexes all 48 PERS assets with family, filename expression token, source GIF dimensions, frame count and container bytes. It exposes immutable listing, exact basename lookup, family/expression variants and aggregate counts. It rejects path traversal and does not include proprietary image payloads or infer runtime state transitions. Six JVM tests verify 48 files, 1,846 frames, 2,502,596 bytes, family totals, dimensions, variants, safe lookup and immutability.

Code commits: `4d05afe851fd53fac98619416d9b5cf6433a95a9` and `6ca7f818747f3da7265ed5dd02e249462b130cf8`; family-count test correction: `6e3422d744269a9b5a475feca93d7012838ab9fe`. Initial Android run #271 (`44911236334`) exposed an incorrect 24/24 family assertion; corrected to the inventory's 23 circle / 25 miantuan and committed. Backend run #240 (`44911443976`) passed. Android run #275 (`44911443963`) was still in progress at last check. Do not mark the persona catalog slice validated until run #275 completes successfully. Exact React Native version remains unknown; no guessed dependency has been added.

## React Native version recovered — 0.59.4 (2026-11-21)

The user re-uploaded the exact Cortana 3.3.3.2876 APK; SHA-256 matches `c8c3192bc29057dfc398f4cb8fa3bfc549422373e0688a4c6de993f37a233d6c`. Inspected `assets/index.android.bundle` (4,313,700 bytes): Metro module 98 contains `e.version={major:0,minor:59,patch:4,prerelease:null}` exactly once at offset 171,370. Module 97 reads `PlatformConstants.reactNativeVersion`. This identifies the embedded JavaScript React Native package as **0.59.4**, superseding earlier notes that said the exact version was unknown.

Evidence and compatibility plan: `docs/legacy/REACT_NATIVE_RUNTIME_FINGERPRINT.md`. The DEX contains legacy Bridge APIs, Promise, CatalystInstance and ReactInstanceManager. ARM64/ARMv7 include `libreactnativejni.so`, `libjscexecutor.so`, `libjsc.so`; no Hermes. Keep current probe on its modern toolchain. Next build an isolated RN 0.59.4 shell, check native PlatformConstants version parity, then verify no-op NativeModule registration, Promise resolve/reject, DeviceEventManagerModule event delivery and lifecycle teardown before integrating AndroidBridgeRuntime.

New evidence commit: `06c5b26c102dadcc991e75346b4b3770a768d035`. Follow-up status/roadmap/checkpoint docs updated after it. Keep branch `stage-004r/bootstrap`, PR #1 draft, and `main` untouched.

## Stage 004V-6A CI validation — Android run #275 (2026-11-21)

Android run #275 (`44911443963`) passed on the persona catalog code commit `6e3422d744269a9b5a475feca93d7012838ab9fe`: host-JVM unit-test task passed, debug/instrumentation APKs assembled, and 12/12 API 35 emulator instrumentation tests completed. Backend run #240 (`44911443976`) passed. Artifact #14710076733; ZIP SHA-256 `03cfc5d97179712845c99a4e78602df3b27ec7c8b3fb6f941809f6d3d29db1ad`. This validates the persona metadata catalog code and family-count correction. It does not validate an RN 0.59.4 shell.

The RN version is now recovered from the re-uploaded bundle as 0.59.4. See `docs/legacy/REACT_NATIVE_RUNTIME_FINGERPRINT.md`. Follow-up docs commits after the tested code commit: fingerprint `06c5b26c102dadcc991e75346b4b3770a768d035`, compatibility update `21bf9e37718a2b0d6fc567dcab6b7b210b698942`, status `01f13b57a18c4cbcdb86ba493ac72275e738e448`, roadmap `dee81b5eea4ba30b9aefc7f643650ada8ac903b4`, checkpoint `864930746e133029c72b610d7f7f697fed973842`.

## Stage 004V-7 — RN 0.59.4 compatibility shell scaffold (2026-11-22)

Added `android/rn0594-compat/` as an isolated legacy Android app so the modern `android/probe` toolchain is not downgraded. Direct JS pins: React 16.8.3, RN 0.59.4. Android: AGP 3.3.1, Gradle 4.10.1, compileSdk/build-tools 28, minSdk 19, targetSdk 28, JDK 8. Added ReactActivity/ReactNativeHost, ReactPackage, no-op `RN0594Probe` NativeModule, Promise resolve/reject and `RCTDeviceEventEmitter` event test. JS logs native PlatformConstants version and requires 0.59.4 parity. Workflow `.github/workflows/rn0594-compat.yml` bundles, builds and launches on API 28 emulator; it gates success on native version, both Promise paths and event marker.

Compatibility shell remains **unvalidated**: no local build or Actions result observed yet. No transitive npm lockfile committed; reproducible lockfile is still needed. The legacy ReactPackage implementation intentionally omits `createJSModules()`, removed from the interface before RN 0.59.4. Do not merge into main or claim NativeModule integration success until CI proves the shell.

## RN 0.59.4 shell CI iteration 1 — SDK/JDK mismatch (2026-11-22)

Workflow run #15 (`44934215889`) failed in `android-actions/setup-android@v4` before SDK packages, npm install, JS bundle or Gradle build. Its downloaded command-line tools 22.0 require JDK 17; the workflow had JDK 8 active for Gradle. Fixed workflow `.github/workflows/rn0594-compat.yml`: activate JDK 17 for Android SDK setup/install, then switch to JDK 8 before Gradle 4.10.1. This failure is environment bootstrap only and provides no signal on app compilation. Await next run.

## RN 0.59.4 shell CI iteration 2 — Metro Babel preset (2026-11-22)

Workflow run #20 (`44934341325`) passed JDK17 Android SDK setup, Android SDK 28 packages, JDK8 switch and npm install. Metro bundle step failed while parsing Flow syntax in RN `Libraries/Blob/URL.js` (unexpected punctuation token). Added `android/rn0594-compat/.babelrc` with `module:metro-react-native-babel-preset` to activate the RN-era Flow/Babel transform. Await next run; no APK compiled or emulator tests performed yet.

## RN 0.59.4 shell CI iteration 3 — Babel dependency pin (2026-11-22)

Workflow run #24 (`44934502675`) passed SDK/JDK setup and npm install, but Metro failed parsing Flow syntax in `Libraries/Blob/URL.js`. First Yarn attempt #29 (`44934669969`) failed dependency installation because some modern transitive packages require Node >=18/20 while the workflow still used Node 10. Current correction: keep React Native 0.59.4, resolve `metro-react-native-babel-preset` to 0.59.0 for the Flow parser fix, run Metro on Node 20, and keep Gradle on JDK 8 after Android SDK setup under JDK 17. Yarn 1.22.22 remains the dependency manager. Generated `yarn.lock` must be committed after the first successful resolution. Next CI must prove bundle generation, then compile and emulator tests.

## RN 0.59.4 shell CI iteration 4 — Babel core peer (2026-11-22)

Workflow run #37 (`44934828118`) passed SDK/JDK setup and Yarn install on Node 20, but Metro failed with `Cannot read properties of undefined (reading 'transformFile')`. Yarn logs showed missing peer `@babel/core` for the Metro transformer/preset. Added explicit build dependencies `@babel/core 7.16.5` and `metro-react-native-babel-preset 0.59.0`; RN runtime remains pinned to 0.59.4. Await next CI to validate bundling, compilation and API 28 emulator checks.

## RN 0.59.4 shell CI iteration 5 — Node 16 Metro host (2026-11-22)

Workflow run #45 (`44934939862`) passed SDK/JDK setup and Yarn install with explicit Babel core/preset dependencies, but Metro failed with `Cannot read properties of undefined (reading 'transformFile')`. This is a secondary Metro initialization symptom; older Metro stacks are known to fail under too-new Node runtimes. Switched Metro host from Node 20 to Node 16.20.2 and enabled Yarn `--ignore-engines` to bypass engine metadata on newer transitive packages. RN stays 0.59.4; Metro preset 0.59.0 and Babel core 7.16.5 are tooling-only. Next run must confirm bundle generation.