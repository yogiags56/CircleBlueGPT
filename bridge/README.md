# Android / React Native bridge

## Current state

The legacy application exposes a Newman bridge with text-query, listening, cancellation and conversation-reset methods. The static audit mapped the JS/native event relationship and response DTO shape. This does not prove the old Microsoft CSDK is operational or reusable.

## Proposed bridge API

- `getBridgeStatus()` — readiness and capability snapshot.
- `sendQuery(requestId, conversationId, text)` — submit text only.
- `cancelQuery(requestId)` — cancel local delivery and request backend cancellation.
- `resetConversation(conversationId)` — clear transient conversation state.

## Required behavior

- Text-only MVP; do not auto-start microphone/KWS.
- Register event listeners before enabling query submission.
- Gate submission until the native bridge and backend session are ready.
- Deliver at most one terminal result per request ID.
- Buffer only bounded events while the UI is temporarily detached; define replay/expiry semantics.
- Never leave a promise pending indefinitely: use explicit timeout and structured error states.
- Preserve persona/UI ownership in the app shell; transport code must not own persona animation state.

The proposed API is a design contract, not an implemented React Native NativeModule.

## Stage 004V implementation status

A platform-neutral Java foundation now exists in `android/probe/app/src/main/java/com/cortanagpt/probe/bridge/`:

- `ChatRequest` validates text-only input, request/conversation IDs and bounded selected-memory context (maximum 10 items, 2,048 characters per item, 8,192 characters total).
- `ChatResponse` accepts only a matching request ID and nonempty bounded response text; provider metadata, tools and actions are intentionally excluded.
- `BridgeCore` prevents duplicate active request IDs and arbitrates success, failure and cancellation so only one terminal callback wins. Late callbacks after cancellation are ignored.
- The gateway is injected as an interface. No HTTP client, production URL, session authentication or GPT provider is wired into this probe.

The first CI run exposed a test-fixture mistake: the aggregate-memory test used one item larger than the per-item limit, so it did not reach the aggregate check. The fixture was corrected to use five individually valid 1,700-character items (8,500 total). The corrected Android run #94 passed all 12 host-JVM tests, APK assembly and all 3 API 35 emulator instrumentation tests. The resulting APK artifact was downloaded and ZIP/APK hashes verified.

**Threading contract:** callbacks currently run on the thread that completes the gateway operation (or the caller thread for cancellation). An Android UI adapter must marshal callbacks onto the main thread. This core is not a React Native NativeModule and does not yet implement bounded streaming/event buffering or timeout policy.

## Stage 004V-2 lifecycle hardening

The platform-neutral bridge core now injects three independent boundaries:

- `Gateway`: transport submission and best-effort call cancellation.
- `TimeoutScheduler`: cancellable deadline task; the core accepts a timeout duration and arbitrates timeout against success/failure/cancel.
- `CallbackDispatcher`: delivers terminal listener callbacks without coupling the core to Android UI classes.

Android adapters:
- `AndroidMainThreadDispatcher` posts listener callbacks to the main looper.
- `MainLooperTimeoutScheduler` schedules cancellable timeout tasks on the main looper. A blocked UI thread can delay timeout delivery; gateway/network work must never run on the main looper.

Lifecycle guarantees in the core:
- The first terminal event wins: success, generic gateway failure, `REQUEST_TIMEOUT`, or cancellation.
- Timeout handles are cancelled on terminal completion.
- A gateway call handle returned after timeout/cancellation is immediately cancelled.
- Late gateway callbacks are ignored.
- Listener code is not called under the internal lock. Listener and dispatcher runtime exceptions are contained so they cannot corrupt request state.

The JVM suite now exercises timeout-vs-success/cancel, timeout before the gateway returns its call handle, cancellation before handle return, deferred dispatch, listener/dispatcher exceptions and scheduler failure. API 35 instrumentation also checks that the Android dispatcher and timeout adapter execute on the main looper. Android run #120 (`44900668260`) passed the 20 host-JVM tests, APK assembly and all 5 API 35 emulator instrumentation tests. The Android adapter behavior is validated on API 35; API 19–22 runtime behavior is still not emulator-tested.


## Stage 004V-3 — local/mock HTTPS gateway (implementation in progress)

Files:
- `ChatProtocolCodec.java`: protocol-v1 JSON encoding/decoding.
- `ChatHttpGateway.java`: bounded asynchronous HTTPS transport.

Protocol codec:
- Encodes the proposed v1 request DTO: protocolVersion, requestId, optional conversationId, input.text and context.selectedMemory.
- Decodes only protocolVersion, requestId and message.text; duplicate or unknown fields are rejected.
- Requires exact protocol version and matching request ID; rejects empty/oversized text and malformed/trailing JSON.
- Request JSON cap: 64 KiB. Response body cap: 256 KiB. Response text cap: 65,536 characters.
- UTF-8 decoding is strict; malformed byte sequences are rejected.

HTTP gateway:
- Endpoint URL is injected and must use HTTPS; userinfo, query and fragment are rejected.
- Default connection factory uses the platform HTTPS stack and default certificate validation.
- Uses an injected background Executor; never pass a main-thread executor.
- POSTs fixed-length JSON to the injected endpoint with Content-Type, Accept and Idempotency-Key headers.
- Connect/read timeouts are configurable and bounded to 120 seconds maximum.
- Redirects are disabled; only HTTP 200 is accepted.
- Response Content-Length and streaming reads are both bounded; non-200 bodies and provider error details are not exposed.
- Cancellation and completion share one atomic lifecycle gate. Cancellation disconnects the active connection best-effort and suppresses late callbacks.
- No Authorization/session token, production URL, GPT provider secret, retry or provider orchestration is included.

CI history:
- First Android run #152 (`44901611627`) failed 1/37 JVM tests: the strict parser classified a second top-level JSON value as malformed instead of the explicit trailing-data code.
- Parser handling was corrected in commit `6e46c5a0d2b5c0ab3eac851d74720e9c7c70f30b`.
- Corrected Android run #154 (`44901777496`) completed successfully: 37/37 host-JVM tests, APK assembly and 5/5 API 35 emulator instrumentation tests passed. Artifact #14706586070 was downloaded and ZIP/APK hashes and archive integrity verified.
- Backend run #142 (`44901777488`) passed typecheck/build, migration idempotency and integration test steps.


**Transport test boundary:** the current JVM transport tests inject a fake `HttpsURLConnection`. They validate request configuration, bounds, parsing, errors and cancellation, but they do not establish a real TLS socket handshake or end-to-end HTTP server interoperability. Stage 004V-3B must add a local HTTPS mock-server suite before claiming real mock-server integration.

## Stage 004V-3B — real local HTTPS mock-server suite (CI pending)

A separate `ChatHttpGatewayTlsIntegrationTest` uses OkHttp MockWebServer with a generated local certificate. The test client explicitly trusts only that certificate; this trust configuration exists only in test code and does not alter the production/default HTTPS factory.

Coverage:
- Real TLS handshake and v1 POST round-trip, including path, headers and body.
- Redirect response is rejected and not followed.
- HTTP 503 maps to a generic failure.
- Delayed body triggers the configured read timeout.
- Oversized response body is rejected.
- Cancellation during an in-flight response read suppresses late callbacks.
- Platform default trust store rejects the self-signed test certificate when the test-only trust factory is not supplied.

Android run #167 (`44902414304`) completed successfully: 44/44 host-JVM tests, APK assembly and 5/5 API 35 emulator instrumentation tests passed. Artifact #14706248982 was downloaded and ZIP/APK hashes and integrity verified. Stage 004V-3B is complete.


**Next stage (004V-3C):** add API 35 Android instrumentation that exercises the actual `ChatHttpGateway` over a local HTTPS MockWebServer using test-only trust. The current real-TLS tests run on the host JVM; Android runtime HTTPS interoperability remains unverified.

**Stage 004V-3C complete:** Android API 35 instrumentation exercised the actual `ChatHttpGateway` against local HTTPS MockWebServer using test-only certificate trust. It verified TLS round-trip through BridgeCore, main-looper listener delivery, redirect rejection and cancellation during response read.

**Next stage (004V-4):** add a platform-neutral legacy conversation adapter for the statically mapped NewmanViewModule text-query/reset/cancel surface. The adapter must produce only validated `view.displayText` messages and explicitly reject legacy skill/action events outside the MVP.

## Stage 004V-4 — legacy conversation adapter (CI pending)

`LegacyConversationAdapter` is a platform-neutral compatibility boundary for the statically mapped NewmanViewModule text conversation surface.

- `sendQuery` and `onUserManualInput` create validated text-only ChatRequest instances.
- An injected `SelectedMemoryProvider` chooses at most the bounded memory context; the adapter never exports the full local memory store.
- Successful assistant text is mapped only to `LegacyMessage.view.displayText`, matching the legacy text display requirement.
- `cancelListening`, `resetConversation` and `forceResetConnection` map to local lifecycle operations. Stale responses after replacement/reset are ignored.
- Submission/cancel/reset transitions are serialized; user callbacks are invoked outside adapter state locks to support reentrant listener behavior.
- `startListening`, `onAdaptiveCardSubmit` and `sendSkillEvent` explicitly return unsupported errors in the text-only MVP.
- This is not a React Native NativeModule. It has no RN dependencies and does not modify the original Cortana APK.

Twelve deterministic JVM tests cover request mapping, selected memory, invalid input, cancellation/reset, replacement, reentrant callbacks, stale response suppression and unsupported legacy actions. Corrected Android run #209 (`44903854337`) passed the host-JVM task (56 tests) and APK assembly; API 35 instrumentation is still in progress. Backend run #186 (`44903854393`) passed 41/41 tests.

