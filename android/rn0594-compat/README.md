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
