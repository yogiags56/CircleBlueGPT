# Cortana React Native bridge compatibility audit

**Status:** static APK audit completed; exact React Native release is not yet pinned. No NativeModule has been compiled or loaded into the original Cortana runtime.

## 1. APK evidence

Static inspection of the user-provided Cortana Android 3.3.3.2876 APK found these React Native bridge/runtime symbols in DEX strings:

- `ReactContextBaseJavaModule`
- `ReactInstanceManager`
- `ReactRootView`
- `CatalystInstance` / `CatalystInstanceImpl`
- `NativeModuleRegistry`
- `JavaScriptExecutorFactory`
- `JSCJavaScriptExecutorFactory` / `JSCExecutor`
- `DeviceEventManagerModule.RCTDeviceEventEmitter`

Native libraries present for both ARM64 and ARMv7:
- `libreactnativejni.so`
- `libjscexecutor.so`
- `libjsc.so`

No `libhermes.so` was present in the inspected APK. The bundle contains the legacy Cortana React Native UI and the static audit already mapped NewmanViewModule's conversation-facing methods.

A TurboModule-related diagnostic string is also present in DEX, but that alone does **not** prove the application registers or uses TurboModules. The observed CatalystInstance/JSC bridge remains the reliable evidence.

## 2. Version pinning result

The exact React Native semantic version was not exposed by the APK metadata or the inspected version strings. The APK's Cortana app version (3.3.3.2876) is not the React Native version.

Do not guess a `react-android` Maven version or compile a module against an arbitrary React Native release. Before choosing the dependency:
1. Recover the original Gradle dependency lock/build files if available.
2. If not, inspect class/method signatures and native library fingerprints against candidate RN artifacts.
3. Record the selected RN version and the evidence that pins it.
4. Build and run the isolated shell with that exact version before any original APK patch.

## 3. NativeModule compatibility direction

The first isolated integration should target the legacy bridge API observed in the APK, not assume a new architecture/TurboModule implementation.

Expected shape once version-pinned:
- A `ReactContextBaseJavaModule` implementation with a unique module name.
- Registration through the matching legacy `ReactPackage` mechanism for that RN version.
- Text methods forwarding to `AndroidBridgeRuntime`: `sendQuery`, `onUserManualInput`, `cancelListening`, `resetConversation`, `forceResetConnection`.
- A JS event bridge using the runtime's main-looper callbacks and a version-compatible `RCTDeviceEventEmitter`/NativeEventEmitter contract.
- Listener lifecycle methods (`addListener` / `removeListeners`) only as required by the pinned RN release.
- Native module destruction must close the runtime and cancel active work.

The precise method annotations, Promise/callback conventions, event name, and lifecycle override must be confirmed against the selected RN source/API. Do not invent compatibility based on current RN docs.

## 4. MVP allowlist and response contract

Allowed:
- Text query and manual text input.
- Assistant text mapped to the narrow legacy response shape `view.displayText`.
- Local cancel/reset/force-reset.
- Optional selected-memory context only.

Explicitly unsupported:
- Voice recording/listening.
- Adaptive-card action submissions.
- Legacy skills or device actions (alarms, calls, SMS, settings, contacts).
- Microsoft account tokens, Bing headers or retired Cortana service calls.

No provider metadata, tool call, arbitrary adaptive card or legacy action payload may cross into the original UI surface.

## 5. Security and lifecycle

- Provider API keys stay backend-only.
- The endpoint is injected through app configuration; no production URL or credentials are hard-coded in the APK.
- AndroidBridgeRuntime owns its worker executor, timeout scheduler and gateway lifecycle.
- Module callbacks must reach JS through the RN bridge; they must not call ReactContext methods after catalyst/React context destruction.
- On module/host destruction: cancel active request, close runtime, stop executor; ignore late callbacks.
- Keep the original APK immutable. Test only in a separate shell until module registration, event delivery, cancellation and host recreation pass.

## 6. Next actions

1. Obtain or reconstruct the exact RN dependency version.
2. Build a minimal isolated RN Android shell using that version.
3. Register a no-op diagnostic NativeModule and verify JS-to-native method invocation and native-to-JS event delivery.
4. Replace the no-op with the thin AndroidBridgeRuntime adapter.
5. Test rotation/recreation, background/foreground, React context teardown, active request cancellation and main-thread event ordering.
6. Only then assess a controlled merge with the Cortana UI/persona shell.

## 7. Additional evidence from the supplied APK — 2026-11-21

The supplied APK was inspected without modifying it. Its SHA-256 matches the baseline recorded in the project checkpoint:
`c8c3192bc29057dfc398f4cb8fa3bfc549422373e0688a4c6de993f37a233d6c`.

The JavaScript bundle `assets/index.android.bundle` is 4,313,700 bytes. Static string/call-site inspection shows the JS-facing Newman module is exported as `NewmanViewManager` and is referenced by conversation actions.

Observed call-site semantics:
- `sendQuery(text, boolean)` is called with text and a boolean; the returned promise is used to obtain a request ID. The boolean's semantic meaning is not established by the inspected call sites, so do not name it voice/alternate mode or map it into policy until the native declaration and JS call paths are fully traced.
- `onUserManualInput()` is called with no arguments from the text-input-focus handler. This is a focus/UI notification, not a text submission.
- `cancelListening()` is called with no arguments.
- `resetConversation()` is called with no arguments.
- `forceResetConnection()` is called in a narrow reset path after a guest-handoff response.
- Additional methods `startListening`, `sendSkillEvent`, `onAdaptiveCardSubmit`, `logCardShown`, and commute/video-related methods exist in the bundle but remain outside the MVP allowlist.

The bundle imports React Native `NativeEventEmitter` and registers listeners for Newman commute/CSDK state, query-text, response and error events. This is evidence of event-emitter usage in that part of the app; it does not establish that the basic text-query path needs all those events. The MVP should emit only the minimum request lifecycle/result events it actually consumes.

The APK contains 48 persona PERS assets: 23 `circle_*` and 25 `miantuan_*` files, totaling 2,502,596 bytes. All embedded GIF payloads have been decoded and their frame counts checked against the PERS XML metadata. The exact mapping from these assets to runtime persona states, playback timing and transitions remains unverified. See `docs/legacy/CORTANA_PERSONA_ASSET_INVENTORY.md`.

Important correction to the bridge contract: `onUserManualInput()` is a no-argument focus hook. It must not be modeled as `onUserManualInput(text)` or submit a query. Query submission is the responsibility of `sendQuery(text, ...)`.

## 8. Exact-version limitation remains

The bundle evidence confirms the legacy Bridge/JSC architecture but still does not identify an exact React Native semantic version. Do not pin a Maven dependency based on Cortana app version, bundle size, or JSC presence alone. Continue with class/method and native ABI fingerprinting or recover build metadata from a trusted source.

## 9. Re-inspection of the re-uploaded APK — DEX method descriptors (2026-11-21)

The APK was re-opened from the current conversation upload and verified against the project baseline:
- APK size: 68,915,677 bytes.
- SHA-256: `c8c3192bc29057dfc398f4cb8fa3bfc549422373e0688a4c6de993f37a233d6c`.
- DEX files: `classes.dex` (8,936,432 bytes) and `classes2.dex` (3,889,108 bytes).
- React Native classes are present in DEX, including `ReactContextBaseJavaModule`, `ReactApplicationContext`, `Promise`, `ReactMethod`, `CatalystInstanceImpl`, and the legacy Java bridge APIs.
- Both ARM64 and ARMv7 contain `libreactnativejni.so`, `libjscexecutor.so`, and `libjsc.so`; neither ABI contains `libhermes.so`.

DEX class-data parsing confirms the exact declared Java method descriptors for `com.microsoft.bing.dss.reactnative.module.NewmanViewModule`:

| Method | DEX descriptor |
|---|---|
| Constructor | `(ReactApplicationContext) -> void` |
| `sendQuery` | `(String, boolean, Promise) -> void` |
| `onUserManualInput` | `() -> void` |
| `cancelListening` | `() -> void` |
| `resetConversation` | `() -> void` |
| `forceResetConnection` | `() -> void` |
| `sendSkillEvent` | `(String, String, ReadableMap, boolean, Promise) -> void` |
| `onAdaptiveCardSubmit` | `(ReadableMap, String) -> void` |
| `logCardShown` | `(String, String) -> void` |

Important bridge correction/refinement:
- The native `sendQuery` method is **not** a Java method returning a String. It returns `void` and receives a React Native `Promise` as its third argument. The JavaScript-visible request ID is delivered through Promise resolution.
- The second argument is a primitive boolean. Its meaning is still unresolved; do not rename it to voice, alternate mode, or any other semantic label until its method body and all JavaScript call sites are traced.
- The existing platform-neutral adapter may continue returning a request ID internally, but a future RN wrapper must resolve/reject the supplied `Promise` and must not expose the internal Java return type as the RN method contract.
- `onUserManualInput()` is exactly no-argument and remains a focus notification, not a query submission.

This establishes the method-level ABI shape for the Newman module, but it does not establish an exact React Native release number. Do not pin a Maven artifact from these descriptors alone. Continue version fingerprinting using additional class/API and native-library evidence or recover original Gradle dependency metadata.
