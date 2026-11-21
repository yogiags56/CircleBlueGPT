# CortanaGPT — Recovery Checkpoint

**Checkpoint date:** 2026-11-21  
**Project:** CortanaGPT / CircleBlueGPT  
**Repository:** https://github.com/yogiags56/CircleBlueGPT  
**Working branch:** `stage-004r/bootstrap`  
**Pull request:** #1 — draft, targets `main`  
**Current milestone:** Stage 004V — platform-neutral bridge core  
**Checkpoint status:** durable handoff; continue from this file and the current branch HEAD.

> Recovery rule: when a conversation is interrupted, first read this file, then inspect the current branch HEAD and the latest GitHub Actions runs. Do not infer progress from chat history alone. Treat the repository and CI evidence as authoritative.

> **Latest dated checkpoint:** [2026-11-21 — Stage 004V](docs/checkpoints/2026-11-21-stage-004v.md). Detailed checkpoint latest update commit: `fb1cd58b0efa62f779704ad3df5dec028f65eac9`. This dated record includes verified Android run #94, backend run #99, current limitations, and explicit next steps for lifecycle hardening. Read it after this root index when resuming.

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
