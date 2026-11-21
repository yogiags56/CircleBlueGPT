# Project status

**Snapshot:** 2026-11-21  
**Current stage:** 004S — Android Keystore probe validation and secure session destruction  
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

- GitHub Actions run: `44890430358` (commit `8e4438c3bd068b2e3e61306c0554f70c3b34a2af`).
- API 35 emulator instrumentation: **3/3 tests completed successfully**.
- Debug app and instrumentation APKs were uploaded as artifact `cortanagpt-probe-apks` (artifact ID `14701443256`).
- Artifact ZIP SHA-256: `5b2b0a4e0d375f4e66b87ae4d0ce764052223e9fd191ee673ffad5310b7c0b1d`.
- ZIP integrity verified; contents: debug app APK (11,051 bytes) and instrumentation APK (1,679,080 bytes).
- The earlier API 19–22 instrumentation test returned without exercising its branch on API 35. Stage 004S moves this policy boundary to explicit host-JVM tests and adds a real API 35 destroy-flow test. These changes require a new CI run before they are considered verified.

## Prototype work (not production)

- Platform-neutral BridgeCore and AES-GCM codec prototypes exist in the recovery workspace.
- Java HTTP transport prototype uses HTTPS in production mode, bounded response parsing, request IDs, idempotency headers, bounded retries and best-effort server cancellation.
- These host-JVM prototypes are not yet promoted into the repository and are not part of the Android app.
- The probe is not the restored Cortana app and does not connect to a GPT provider.

## Not yet verified

- The latest Stage 004S source changes until the next CI run completes.
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

1. Complete Stage 004S CI for JVM policy tests and Android API 35 instrumentation.
2. Promote and validate the platform-neutral BridgeCore, AES-GCM codec and HTTP transport source/tests from the recovery workspace when the exact files are available.
3. Define the anonymous enrollment/session API contract and threat model.
4. Implement the backend session issuer before connecting any GPT provider.
5. Build the Android–GPT transport bridge, then integrate the original Cortana UI/persona without changing her identity.
