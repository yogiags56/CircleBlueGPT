# React Native 0.59.4 compatibility shell

This isolated Android app is a compatibility experiment for the Cortana APK's
embedded JavaScript package version. It is deliberately separate from
`android/probe`, which remains on its modern AGP/Gradle toolchain.

## Pinned toolchain

- React Native: 0.59.4
- React: 16.8.3
- Android Gradle Plugin: 3.3.1
- Gradle: 4.10.1
- JDK: 8
- compileSdk / Build Tools: 28 / 28.0.3
- minSdk / targetSdk: 19 / 28

AGP 3.3.x requires Gradle 4.10.1; see the Android Gradle Plugin 3.3 release
notes. This is a legacy compatibility toolchain, not a recommendation for a
new production app.

## What this shell tests

- ReactActivity and ReactNativeHost bootstrap.
- Legacy ReactPackage registration.
- A no-op `ReactContextBaseJavaModule`.
- JavaScript-to-native `ping()` invocation with Promise resolution.
- The runtime's `PlatformConstants.reactNativeVersion` value.

The JS bundle is generated during CI from this directory's pinned npm
dependencies. No Cortana APK, proprietary bundle, persona image, credential,
or production endpoint is included.

## Local build

Use JDK 17 for current Android SDK command-line tools, then JDK 8 for Gradle 4.10.1. Use Node 16 for compatibility with the historical Metro 0.51 runtime and Yarn 1 with engine checks disabled for newer transitive metadata-only packages:

```sh
yarn install --ignore-scripts --non-interactive
mkdir -p app/src/main/assets
node node_modules/react-native/local-cli/cli.js bundle \
  --platform android --dev false --entry-file index.js \
  --bundle-output app/src/main/assets/index.android.bundle \
  --assets-dest app/src/main/res/
gradle --no-daemon :app:assembleDebug
```

The package manifest keeps React Native at 0.59.4 while resolving the Metro Babel preset to 0.59.0. This preset revision contains the Flow parsing fix needed for modern Babel traversal behavior; it is a build-tool adjustment, not an RN runtime upgrade. Commit the generated `yarn.lock` after the first successful dependency resolution to make the full transitive tree reproducible.

## Compatibility gates still open

A successful build alone does not prove compatibility with Cortana's packaged
native runtime. CI must additionally launch the app on an API 28 emulator and
observe both `RN0594_PLATFORM_VERSION` and
`RN0594_NATIVE_PROMISE_OK:native-module-ready` in ReactNativeJS log output.
Compare the reported native version with the bundle's 0.59.4 declaration.


## Cortana text bridge integration (initial adapter)

The compatibility shell now includes `CortanaBridgeModule`, which wraps the
validated platform-neutral bridge classes copied from `android/probe`:

- `sendText(text)` returns a request ID Promise; assistant output, errors and
  cancellation are delivered through `CortanaAssistantMessage`,
  `CortanaBridgeError` and `CortanaBridgeCancelled` events.
- `setConversationId(id)`, `cancelListening()`,
  `resetConversation()` and the no-argument `onUserManualInput()` hook
  preserve the text conversation lifecycle.
- Network requests run on a dedicated worker; bridge callbacks are dispatched
  to Android's main looper. Runtime teardown cancels active work.
- Only HTTPS is accepted. Cleartext traffic is disabled and the INTERNET
  permission is declared.

The default `cortanagpt_chat_endpoint` Android string resource is deliberately
empty. Supply the deployment endpoint through a local/flavor resource overlay;
do not commit provider credentials, access tokens or production endpoints.
Until configured, `getBridgeStatus()` returns
`endpoint-not-configured` and query submission fails closed. The smoke test
checks that this NativeModule is registered without making a network request.

This is an initial integration boundary, not yet a production chat release:
backend endpoint contract, response schema interoperability, selected-memory
policy, cancellation under real network load, and end-to-end device testing
remain to be validated. The legacy `sendQuery(text, boolean)` boolean meaning
remains unresolved and is intentionally not exposed.


### CI lifecycle checks

The RN emulator smoke test also exercises the fail-closed and idle lifecycle paths
without a configured endpoint:

- `getBridgeStatus()` must report `endpoint-not-configured`.
- `sendText()` must reject with `E_BRIDGE_UNAVAILABLE` instead of attempting a request.
- `cancelListening()` with no active runtime must resolve `false`.
- `resetConversation()` with no active runtime must resolve successfully.
- The legacy no-argument `onUserManualInput()` call must not submit a message or crash.

These checks prove registration and safe unconfigured behavior only. They do not
validate a live HTTPS response, authentication, provider execution or cancellation
against an active network request.

### Android Keystore enrollment identity (004V-18; emulator validation pending)

`AndroidEnrollmentKeyProvider` creates a per-installation ECDSA P-256 key pair in Android Keystore under alias `cortanagpt.enrollment.p256.v1`. The private key is non-exportable and has signing-only purpose with SHA-256 digest. The provider exposes only the public JWK coordinates and RFC 7638 thumbprint, and signs the versioned enrollment canonical payload using `SHA256withECDSA` (DER signature encoded as unpadded Base64URL) to match the backend verifier.

`CortanaBridgeModule` exposes `getEnrollmentPublicKey()` and `signEnrollmentChallenge(challengeId, nonce)` to React Native. API levels below 23 fail closed because the enrollment key provider depends on Android Keystore EC key generation. This key is distinct from the AES local-memory key.

The API 28 emulator smoke test now checks public JWK shape, stable identity across repeated calls, signature encoding, and invalid challenge rejection. Passing those checks validates the native bridge and key lifecycle on the emulator; it does not yet prove a full signed enrollment against a live backend. Device hardware-backed/StrongBox availability is not assumed, and attestation policy remains out of scope pending security review.