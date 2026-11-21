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
- A minimal Android probe project exists with API 23+ Android Keystore AES-GCM storage and an explicit no-downgrade policy on API 19–22.

## Latest local test observation

The Stage 004Q test suite was run twice during repository bootstrap. One run failed the asynchronous server-DELETE cancellation assertion after a fixed 350 ms sleep; a subsequent clean run passed 13/13. This makes the cancellation test timing-sensitive. Treat the 13/13 result as a passing rerun, not as proof the test is deterministic. Stage 004R must replace fixed sleeps with bounded latch/poll synchronization and rerun repeatedly.

## Not yet verified

- Android Gradle build or APK generation.
- Android Keystore behavior on emulator/device.
- TLS behavior on API 19 and modern Android.
- Backend enrollment, session issuance, provider integration or durable idempotency.
- React Native bridge integration, original APK patching, signing or installation.
- End-to-end conversation with a real GPT provider.

## Stage 004R objectives

1. Make this repository the durable source of truth for project documentation and validated source.
2. Bring the isolated Android probe and JVM prototypes under version control without including the original APK or proprietary extracted payloads.
3. Make cancellation tests deterministic and record repeated-run results.
4. Establish a reproducible Android SDK/Gradle build environment.
5. Keep backend and original-app integration blocked until their independent contracts and tests exist.
