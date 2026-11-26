# Test strategy

## Stage 004Q JVM suites

The Java transport, bridge and AES-GCM codec test sources remain in the recovery workspace pending source promotion:

`CortanaGPT_Master_Recovery/analysis_artifacts/stage004q/run_tests.sh`

The transport test was corrected locally to replace the fixed 350 ms cancellation sleep with a bounded wait for the asynchronous DELETE request. The callback counter is now atomic. Five consecutive complete suite runs passed:

- HTTP transport: 13/13 each run.
- BridgeCore regression: 10/10 each run.
- AES-GCM codec regression: 3/3 each run.

The Android instrumentation tests are now tracked under `android/probe/app/src/androidTest`, but have not been compiled or executed.

## Promotion rule

When moving JVM sources into this repository, preserve their package names, test behavior and Java 8 compatibility. Do not report the local recovery-workspace tests as CI tests or as an Android build. Add a repository-native runner and CI workflow only after the actual source files are present.
