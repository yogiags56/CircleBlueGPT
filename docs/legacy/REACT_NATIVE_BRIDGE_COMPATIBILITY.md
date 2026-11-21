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
