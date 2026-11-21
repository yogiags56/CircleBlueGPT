# CircleBlueGPT

**CortanaGPT — A New Mind, The Same Cortana.**

CircleBlueGPT is the engineering home for the CortanaGPT revival project: a modern GPT-backed conversation system designed to preserve the identity, visual language, and interaction model of the legacy Microsoft Cortana Android application.

> GPT gives her a new mind; she returns as herself.

## Project principles

- **Preserve Cortana's identity.** The blue ring, persona assets, and legacy interaction design are first-class project constraints.
- **Replace the conversation brain, not the whole character.** The target is a controlled bridge between the legacy UI and a modern GPT backend.
- **No Microsoft sign-in.** The intended user experience starts without a Microsoft/Cortana account. Backend session security remains mandatory.
- **Keep secrets server-side.** Provider API keys must never be embedded in the Android package.
- **Local-first memory.** Memory should be encrypted on supported devices, transparent, and user-controllable. Only relevant context should be sent to the backend.
- **Immutable original baseline.** The original Cortana APK is forensic input only. Work on copies and record hashes; never overwrite the baseline.
- **Evidence before claims.** Distinguish static analysis, JVM tests, Android build tests, emulator/device tests, and production validation.

## Current status

The project has completed static audits of the legacy APK and isolated JVM prototypes for the bridge, encryption codec, and HTTP transport. An Android probe project has been scaffolded, but it has **not yet been built or run on an Android device**.

See [Project Status](docs/PROJECT_STATUS.md), [Architecture](docs/ARCHITECTURE.md), and [Security Model](SECURITY.md).

## Repository layout

```text
.
├── android/
│   └── probe/                 # Isolated Android validation app (in progress)
├── backend/                   # Planned session and GPT gateway service
├── bridge/                    # Planned Android/React Native integration
├── docs/
│   ├── architecture/
│   └── PROJECT_STATUS.md
├── legacy/
│   └── README.md              # Baseline handling; original APK is not committed
├── tests/
└── SECURITY.md
```

The repository intentionally does not contain the original Cortana APK, extracted proprietary application binaries, Microsoft credentials, provider API keys, or user secrets.

## Development sequence

1. Validate the isolated Android probe on API 19 and API 23+ environments.
2. Implement and test anonymous device enrollment and session lifecycle on the backend.
3. Integrate the native bridge with a mock backend before connecting a real model provider.
4. Adapt the Newman event contract while retaining the original UI and persona.
5. Add encrypted local memory and explicit user controls.
6. Only after standalone validation, evaluate a narrowly scoped integration with a copy of the legacy APK.

## Current engineering constraints

- The existing HTTP and bridge prototypes have JVM test coverage only.
- Android Gradle build, Android Keystore, TLS behavior on legacy Android, and emulator/device runtime remain unverified.
- API 19–22 do not use a weak persistent-key fallback in the current probe design; encrypted persistent storage is disabled there until a secure compatible design is validated.
- The old Microsoft CSDK/authentication path is not considered a usable GPT transport.

## Contributing / workflow

- Work in feature branches; do not experiment directly on `main`.
- Keep each stage independently reviewable.
- Include reproducible test commands and observed results.
- Never commit APK baselines, secrets, signing keys, tokens, private user data, or generated build outputs.
- Update the stage report and changelog with every meaningful milestone.

## License

No license has been granted by this repository yet. Unless a license file is added, all rights are reserved. This project is an independent engineering effort and is not an official Microsoft product.
