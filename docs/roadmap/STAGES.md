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
| 004S | Android Keystore probe, API policy tests and secure session destruction | Completed; latest verified run #58 passed JVM policy tests and 3 API 35 instrumentation tests; run #64 is rechecking latest branch changes |
| 004T | Anonymous session protocol, threat model and backend foundation | Fastify + PostgreSQL/Redis, idempotency, P-256 verification, Redis replay guard and one-time enrollment challenge repository implemented; backend CI run #67 passed 34/34 tests; independent protocol review remains a gate before HTTP enrollment/session endpoints |

## Exit criteria for 004R

- Source and docs are committed in this repository.
- Cancellation test uses bounded synchronization rather than fixed sleeps.
- JVM suites pass repeatedly with captured output.
- Android SDK/Gradle build environment is available, or exact blocker and reproducible setup are documented.
- No original APK, secrets or unreviewed proprietary assets are committed.

## Later milestones

- 004U: implement reviewed enrollment/session issuance, proof verification and revocation endpoints.
- 004V: connect the Android bridge against a mock backend, then the reviewed session API.
- 004W: controlled Cortana UI/persona integration assessment.
- 005: end-to-end MVP only after all preceding gates pass.
