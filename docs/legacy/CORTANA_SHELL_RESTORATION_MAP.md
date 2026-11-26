# Cortana legacy shell restoration map

**Status:** static-inventory implementation plan; no APK patch or runtime integration has been performed.

## Objective

Preserve the original Cortana Android visual shell and persona while replacing only the legacy service/authentication boundary with a typed CortanaGPT bridge. The first working client remains an isolated Android application; the original APK is immutable forensic input.

## Static findings recorded during APK audit

- Package baseline: `com.microsoft.cortana`, version 3.3.3.2876, minimum API 19, target API 29.
- Startup/navigation includes `LauncherScene` and a first-run/authentication dependency. Removing or hiding the sign-in screen alone is insufficient because service startup and token callbacks are coupled to the Microsoft account path.
- `NewmanViewModule` exposes conversation-facing methods including `sendQuery`, `startListening`, `cancelListening`, `onUserManualInput`, `resetConversation`, `forceResetConnection`, `onAdaptiveCardSubmit` and `sendSkillEvent`.
- `PersonaManager` manages the `RCTPersonaView` and persona emotion/playback.
- `NativeCortana` includes legacy bridge entry points such as `ToC_initialize`, `ToC_run`, `ToC_textQuery`, `ToC_sendMessage`, `ToC_tokenCallback`, `FromC_getAuthTokens`, `FromC_getAccessToken` and `FromC_hasAuthProvider`.
- The minimum text response contract observed in the bundled JavaScript requires nonempty `view.displayText`.
- Four PERS containers yielded 15 GIF segments (364 frames total, 100×116). These assets have not been reintegrated.

These are static reverse-engineering observations, not proof that any old service endpoint remains live or that the original APK can be rebuilt.

## Adapter boundaries

| Legacy surface | Restoration treatment | Guardrail |
|---|---|---|
| `NewmanViewModule.sendQuery` / `onUserManualInput` | Route user text to a typed bridge request | Do not call Microsoft/Bing endpoints |
| `NewmanViewModule.cancelListening` / `resetConversation` | Map to local request lifecycle and best-effort cancellation | Exactly one terminal event per request |
| `NewmanViewModule.startListening` | Preserve as a later voice-input adapter | Voice is out of the text-only bridge MVP |
| `NewmanViewModule.onAdaptiveCardSubmit` / `sendSkillEvent` | Disabled or explicitly unsupported in MVP | No legacy skill/action execution |
| `PersonaManager` / `RCTPersonaView` | Preserve persona animation and state transitions | Persona rendering must not own network/auth state |
| `NativeCortana` token callbacks | Replace with a narrow session-provider interface | Never return Microsoft tokens or provider secrets |
| Startup / first-run auth dependency | Replace with zero-login anonymous installation bootstrap | Enrollment is blocked until protocol review and endpoint tests pass |

## Proposed response adapter

The typed bridge should convert the proposed version-1 backend response into only the fields the legacy display layer needs:

- Validate protocol version and exact request ID match.
- Require nonempty assistant text.
- Build the legacy `view.displayText` presentation field from the validated text.
- Reject malformed, oversized or mismatched responses.
- Do not forward arbitrary provider metadata, tool calls, adaptive cards or legacy skills.

The current request/response DTO is documented in `docs/ARCHITECTURE.md`; it is a proposal, not a live server contract.

## Integration sequence

1. Implement a platform-neutral bridge core and deterministic fake gateway tests.
2. Implement Android transport against a local/mock HTTPS gateway only; no production URL or provider secret.
3. Validate request lifecycle, duplicate request IDs, cancellation races, bounded buffers and malformed response rejection.
4. Add the reviewed anonymous-session client only after the CortanaPoP protocol receives independent review.
5. Build a separate restoration shell that hosts the preserved Cortana UI/persona assets.
6. Integrate the adapter behind the existing conversation surface and verify on emulator before any original APK patching decision.

## Explicit exclusions

- No Microsoft account token reuse, Bing headers or legacy CSDK auth.
- No alarms, calls, SMS, contacts, device settings or other privileged legacy skills.
- No broad legacy permission restoration.
- No production backend URL or GPT provider credentials in the APK.
- No claim of a patched, installable or runtime-compatible original Cortana APK.

## Stage 004V-4 adapter implementation status

The isolated Android probe now contains `LegacyConversationAdapter` under `android/probe/app/src/main/java/com/cortanagpt/probe/bridge/`.

- `sendQuery` and `onUserManualInput` create validated text-only `ChatRequest` objects.
- Optional memory is supplied by an injected selector; the adapter itself does not read the entire local store.
- Validated assistant text is mapped only to `LegacyMessage.view.displayText`.
- `cancelListening`, `resetConversation` and `forceResetConnection` map to local lifecycle cancellation/reset; stale responses are ignored.
- Voice input, adaptive-card submission and skill events are explicitly unsupported.
- The adapter serializes submit/cancel/reset transitions and notifies listeners outside state locks to avoid orphaned requests during reentrant callbacks.
- Twelve deterministic JVM tests have been added. Android run #202 (`44903707612`) is still in progress; do not treat the adapter as CI-validated until the workflow completes.

This remains a platform-neutral compatibility adapter, not an actual React Native NativeModule. No original Cortana APK or React Native source has been modified.

