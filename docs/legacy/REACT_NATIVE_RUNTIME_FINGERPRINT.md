# Cortana React Native runtime fingerprint

**Inspection date:** 2026-11-21  
**Reference APK:** Microsoft Cortana Android 3.3.3.2876 (APKMirror build)  
**APK SHA-256:** `c8c3192bc29057dfc398f4cb8fa3bfc549422373e0688a4c6de993f37a233d6c`

## Result

The embedded JavaScript bundle identifies its React Native package version as **0.59.4**.

This is a direct version declaration in `assets/index.android.bundle`, not an estimate based on Cortana's app version, file size, JSC presence, or a broad API-era guess.

## Direct bundle evidence

- Bundle path: `assets/index.android.bundle`.
- Uncompressed bundle size: 4,313,700 bytes.
- At byte offset 171,370, Metro module 98 contains the exact version object:
  `e.version={major:0,minor:59,patch:4,prerelease:null}`.
- The exact byte sequence occurs once in the bundle.
- Metro module 97 imports that version object and exposes `checkVersions`, reading `PlatformConstants.reactNativeVersion` from the native runtime.
- The embedded version object therefore identifies the JavaScript-side `react-native` package as 0.59.4. Native/JS version parity should still be checked during isolated shell bring-up using the runtime's PlatformConstants value.

## Native-side corroboration

The same APK contains two DEX files and React Native Java bridge classes, including:
- `ReactContextBaseJavaModule`
- `ReactApplicationContext`
- `Promise` / `PromiseImpl`
- `ReactMethod`
- `CatalystInstanceImpl`
- `NativeModuleRegistry`
- `ReactInstanceManager`
- `JSCJavaScriptExecutorFactory`

Both ARM64 and ARMv7 ship:
- `libreactnativejni.so`
- `libjscexecutor.so`
- `libjsc.so`

No `libhermes.so` was found. This is consistent with the legacy Bridge + JSC runtime represented by the bundle. The APK also contains Fabric/JSI-related classes and native symbols; do not infer that Cortana actively uses Fabric or TurboModules merely from their presence.

## Integration decision

- Use React Native **0.59.4** as the exact JS package version and the first native artifact candidate for a compatibility prototype.
- Do not upgrade to a modern React Native release while attempting to restore the original Cortana bundle.
- Before wiring the production probe, create an isolated RN 0.59.4 Android shell and verify:
  1. Gradle/Maven resolution and Android build compatibility with the repository's current JDK/Gradle/AGP setup.
  2. The native `PlatformConstants.reactNativeVersion` reports 0.59.x and ideally patch 4.
  3. A no-op `ReactContextBaseJavaModule` registers and is callable from JS.
  4. A `Promise` resolves/rejects correctly.
  5. `DeviceEventManagerModule.RCTDeviceEventEmitter` delivers a minimal event.
  6. React context teardown and recreation do not leak callbacks or executors.

The existing Android probe currently uses compileSdk 35, minSdk 19 and a modern Gradle 8.9 CI toolchain. RN 0.59.4 predates that toolchain. Do not add its dependency directly to the current probe until the isolated compatibility build proves the old Android plugin/dependency graph can coexist. Keep the compatibility shell separate if necessary.

## Reproducibility

The original APK was read-only during inspection. No APK, DEX, native library, or proprietary persona payload was added to Git. The evidence can be reproduced by:
1. Opening the APK as a ZIP archive.
2. Reading `assets/index.android.bundle`.
3. Searching for the exact version object above.
4. Verifying the SHA-256 listed at the top of this document.
