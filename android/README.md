# Android probe

The isolated probe lives in the historical Stage 004Q recovery workspace and is being promoted into this repository. Its purpose is to validate Android Keystore and transport behavior without modifying the original Cortana application.

## Current implementation status

- Min SDK 19.
- Java 8 source compatibility.
- HTTPS-only production transport; loopback HTTP is allowed only in JVM tests.
- Android Keystore AES-GCM persistent encryption is gated at API 23.
- API 19–22 persistent sensitive storage is intentionally unsupported in this prototype.
- Instrumentation tests exist for token round-trip, ciphertext-at-rest, key deletion and unsupported legacy API behavior.

## Build prerequisites

Use Android Studio or a compatible Android Gradle Plugin + Gradle + Android SDK toolchain. This project pins Android Gradle Plugin 8.7.3, Gradle 8.9, compileSdk 35 and Java 8 source/target compatibility. AGP 8.7 requires Gradle 8.9 and JDK 17; the JDK running Gradle is separate from the Java source/target compatibility of the app.

A GitHub Actions workflow is provided at `.github/workflows/android-probe.yml`. It installs JDK 17, Gradle 8.9 and Android SDK API 35, then attempts both the debug app and instrumentation APK builds on pushes/PRs affecting the probe. The workflow has been committed but has not yet run successfully; its first CI result is the next build gate.

The probe has not yet been built in this environment. Do not claim an APK was produced until a clean build output and its SHA-256 are recorded.

## Validation matrix

| Environment | Required checks |
|---|---|
| API 19–22 | App launch, ephemeral session behavior, explicit persistent-encryption unsupported state |
| API 23+ | Keystore AES-GCM create/encrypt/decrypt/delete, token persistence |
| Modern API | TLS, lifecycle, backup/data-clear behavior, instrumentation regression |

No API 19 emulator image or device is currently confirmed available.
