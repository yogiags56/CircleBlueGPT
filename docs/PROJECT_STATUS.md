# Project status

**Snapshot:** 2026-11-21  
**Current stage:** 004R — repository bootstrap and Android validation readiness  
**Overall status:** legacy reverse-engineering and platform-neutral prototypes exist; Android runtime integration is not yet validated.

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

## Prototype work (not production)

- Platform-neutral BridgeCore and AES-GCM codec prototypes exist in the recovery workspace.
- Java HTTP transport prototype uses HTTPS in production mode, bounded response parsing, request IDs, idempotency headers, bounded retries and best-effort server cancellation.
- Android probe project is now committed under `android/probe/`, including the Gradle project, manifest, API 23+ Android Keystore AES-GCM token store and instrumentation test source.
- API 19–22 persistent sensitive storage is intentionally unsupported in this prototype; no plaintext or weak-key fallback is provided.

## Stage 004R test observation

The first local rerun exposed a timing-sensitive cancellation assertion caused by a fixed 350 ms sleep. The local test was changed to use a bounded wait for the asynchronous server DELETE and an atomic callback counter. After that correction, five consecutive complete runs passed:

- Stage 004Q transport: **13/13** on each run.
- Stage 004O BridgeCore: **10/10** on each run.
- Stage 004O AES-GCM codec: **3/3** on each run.

The JVM test sources and this test-harness correction are still in the recovery workspace, not yet promoted into this repository. These are host-JVM loopback tests, not Android tests.

## Not yet verified

- Android Gradle build or APK generation.
- Android Keystore behavior on emulator/device.
- TLS behavior on API 19 and modern Android.
- Backend enrollment, session issuance, provider integration or durable idempotency.
- React Native bridge integration, original APK patching, signing or installation.
- End-to-end conversation with a real GPT provider.

## Toolchain check in this workspace

- OpenJDK 21.0.12.1 is present.
- `gradle`, `adb`, Android SDK environment variables, `android.jar` and `sdkmanager` are absent.
- Therefore the Android Gradle project cannot currently be built here. The committed probe uses Android Gradle Plugin 8.7.3 and Java 8 source compatibility. Android's official build documentation lists JDK 17 as the minimum runtime for AGP 8.x; the available JDK 21 satisfies that JDK baseline, but Gradle and Android SDK are still missing.

## Stage 004R objectives

1. Keep this repository the durable source of truth for project documentation and validated Android scaffold.
2. Promote JVM bridge/transport source and tests from the recovery workspace.
3. Keep cancellation tests deterministic and record reproducible results.
4. Establish a reproducible Android SDK/Gradle build environment.
5. Do not commit the original APK, secrets or unreviewed proprietary payloads.
