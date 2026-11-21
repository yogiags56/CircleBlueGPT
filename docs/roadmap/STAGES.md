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
- 004V-3: local/mock HTTPS gateway and strict protocol-v1 codec implemented; first run #152 (`44901611627`) exposed one trailing-JSON error-classification test, corrected in commit `6e46c5a0d2b5c0ab3eac851d74720e9c7c70f30b`. Corrected run #154 (`44901777496`) passed host-JVM tests and APK assembly; API 35 instrumentation is still running. Backend run #142 (`44901777488`) passed. Next: finish emulator validation, then review transport semantics and mock-server coverage.
- 004W: controlled Cortana UI/persona integration assessment using `docs/legacy/CORTANA_SHELL_RESTORATION_MAP.md` as the static adapter plan.
- 005: end-to-end MVP only after all preceding gates pass.
