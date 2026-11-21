# Stage roadmap

| Stage | Focus | State |
|---|---|---|
| 001 | APK forensic audit | Static audit completed |
| 002 | Authentication mapping | Static audit completed |
| 003A–003D | Startup, native bridge, persona extraction | Static audit/extraction completed |
| 004A–004M | Login, DEX, JS/native, Newman, lifecycle and persona contracts | Static audit completed |
| 004N | Anonymous session, backend and memory design | Design/prototype only |
| 004O | Native bridge and AES-GCM platform-neutral prototypes | JVM tests historically reported; revalidation pending |
| 004P | HTTP transport prototype | JVM tests historically reported; revalidation pending |
| 004Q | Retry/cancellation hardening and Android probe scaffold | JVM suite has 13 checks; cancellation test showed timing sensitivity during 004R rerun |
| 004R | Repository bootstrap, deterministic tests, Android toolchain readiness | Completed; CI toolchain validated |
| 004S | Android Keystore probe, API policy tests and secure session destruction | Completed; run #94 (`44899189690`) passed 4 Keystore policy tests, APK assembly and 3 API 35 emulator instrumentation tests; artifact #14705197305 downloaded and ZIP/APK hashes verified |
| 004T | Anonymous session protocol, threat model and backend foundation | Fastify + PostgreSQL/Redis, idempotency, P-256 verification, Redis replay guard and one-time enrollment challenge repository implemented; backend CI run #91 passed 41/41 tests after CortanaPoP naming and lifecycle assertions; independent protocol review remains a gate before public endpoints |

## Exit criteria for 004R

- Source and docs are committed in this repository.
- Cancellation test uses bounded synchronization rather than fixed sleeps.
- JVM suites pass repeatedly with captured output.
- Android SDK/Gradle build environment is available, or exact blocker and reproducible setup are documented.
- No original APK, secrets or unreviewed proprietary assets are committed.

## Later milestones

- 004U: session-token repository primitives implemented and CI-tested; custom CortanaPoP scheme clarified as distinct from RFC 9449 DPoP. Obtain independent protocol review before adding public enrollment/session issuance, proof verification and revocation endpoints.
- 004V: platform-neutral Java request/response DTOs and one-terminal-result bridge core implemented; all 8 bridge JVM tests plus 4 Keystore policy tests passed in Android run #94; APK assembly and all 3 API 35 emulator instrumentation tests passed; artifact #14705197305 was downloaded and ZIP/APK hashes verified.
- 004V-2: injectable timeout scheduler, callback dispatcher, Android main-looper adapters and deterministic lifecycle/race tests implemented. Android run #120 (`44900668260`) passed 20 host-JVM tests, APK assembly and all 5 API 35 emulator instrumentation tests; artifact #14706200956 downloaded and hashes/integrity verified. Backend run #119 (`44900668259`) passed 41/41 tests. **Completed.** Next: local mock-gateway transport and integration.
- 004V-3A: strict protocol-v1 JSON codec and bounded asynchronous HTTPS gateway implemented; first run #152 (`44901611627`) exposed one trailing-JSON classification test, corrected in commit `6e46c5a0d2b5c0ab3eac851d74720e9c7c70f30b`. Corrected run #154 (`44901777496`) passed 37/37 host-JVM tests, APK assembly and 5/5 API 35 instrumentation tests; artifact #14706586070 downloaded and ZIP/APK hashes verified. Backend run #142 (`44901611615`) passed 41/41 tests. **Client transport validated.** Next: 004V-3B real local/mock HTTPS server integration; current tests use a fake `HttpsURLConnection`, not a real TLS socket.
- 004V-3B: real local TLS mock-server integration suite added with generated test certificate and isolated test trust configuration (TLS round-trip, headers/body, redirect, 503, read timeout, oversized response, in-flight cancellation and default trust-store rejection). Android run #167 (`44902414304`) passed 44/44 host-JVM tests, APK assembly and 5/5 API 35 instrumentation tests; artifact #14706248982 downloaded and hashes/integrity verified. Backend run #153 (`44902414337`) passed 41/41. **Completed.** Next: 004V-3C Android runtime HTTPS gateway verification with test-only TLS trust.
- 004V-3C: Android instrumentation for real HTTPS gateway/TLS behavior with test-only certificate trust; no production endpoint or credentials.
- 004V-4: implement a narrow legacy conversation adapter mapping NewmanViewModule text-query/reset/cancel semantics to BridgeCore and validated `view.displayText`; explicitly reject unsupported legacy skills.
- 004V-5: build an Android bridge facade wiring the validated legacy conversation adapter to the HTTPS gateway with injected endpoint/executor and explicit lifecycle ownership.
- 004V-6: static audit confirms legacy React Native Bridge/JSC. Re-uploaded APK bundle identifies the exact JS package as **RN 0.59.4** (Metro version object); NewmanViewManager descriptors/call sites are recorded in `docs/legacy/REACT_NATIVE_BRIDGE_COMPATIBILITY.md`. Persona inventory/catalog covers all 48 PERS assets. Next: isolated RN 0.59.4 compatibility shell, native PlatformConstants parity check and no-op NativeModule/event lifecycle test.
- 004W: controlled Cortana UI/persona integration assessment using `docs/legacy/CORTANA_SHELL_RESTORATION_MAP.md` as the static adapter plan.
- 005: end-to-end MVP only after all preceding gates pass.

- 004V-6A: metadata-only Java catalog added for all 48 original Cortana PERS files, including family/expression token, original GIF dimensions, frame counts and container sizes. Includes immutable lookups and path-traversal rejection plus six JVM tests. No payloads copied; runtime state/transition mapping remains open. Android CI pending.

- 004V-7: isolated RN 0.59.4 Android compatibility shell scaffold committed under `android/rn0594-compat/`. Uses legacy AGP/Gradle/SDK toolchain separately from modern probe; exercises PlatformConstants version parity, NativeModule Promise resolve/reject and event emission. API 28 emulator workflow added; **pending CI validation and transitive dependency lockfile**.