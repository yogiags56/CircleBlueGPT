package com.cortanagpt.probe;

import com.cortanagpt.probe.bridge.BridgeCore;
import com.cortanagpt.probe.bridge.ChatRequest;
import com.cortanagpt.probe.bridge.ChatResponse;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public class BridgeCoreTest {
    private static final String ID = "request-id-00000001";
    private static final long TIMEOUT_MS = 15000L;

    private static final class FakeScheduler implements BridgeCore.TimeoutScheduler {
        Runnable task;
        int scheduleCalls;
        int cancelCalls;
        boolean throwOnSchedule;
        @Override public BridgeCore.Cancellable schedule(Runnable task, long delayMillis) {
            scheduleCalls++;
            assertEquals(TIMEOUT_MS, delayMillis);
            if (throwOnSchedule) throw new IllegalStateException("scheduler details");
            this.task = task;
            return new BridgeCore.Cancellable() {
                @Override public void cancel() { cancelCalls++; }
            };
        }
        void fire() {
            if (task != null) task.run();
        }
    }

    private static final class FakeDispatcher implements BridgeCore.CallbackDispatcher {
        final List<Runnable> pending = new ArrayList<>();
        boolean immediate = true;
        boolean throwOnDispatch;
        @Override public void dispatch(Runnable callback) {
            if (throwOnDispatch) throw new IllegalStateException("dispatcher details");
            if (immediate) callback.run();
            else pending.add(callback);
        }
        void drain() {
            List<Runnable> copy = new ArrayList<>(pending);
            pending.clear();
            for (Runnable callback : copy) callback.run();
        }
    }

    private static final class FakeGateway implements BridgeCore.Gateway {
        BridgeCore.Callback callback;
        int cancelCalls;
        boolean synchronous;
        boolean throwOnSend;
        Runnable beforeReturn;
        @Override public BridgeCore.Call send(ChatRequest request, BridgeCore.Callback callback) {
            this.callback = callback;
            if (throwOnSend) throw new IllegalStateException("private gateway details");
            if (synchronous) callback.onSuccess(new ChatResponse(request.getRequestId(), "hello"));
            if (beforeReturn != null) beforeReturn.run();
            return new BridgeCore.Call() {
                @Override public void cancel() { cancelCalls++; }
            };
        }
    }

    private static final class RecordingListener implements BridgeCore.Listener {
        int successes;
        int failures;
        int cancellations;
        ChatResponse response;
        String errorCode;
        boolean throwOnCallback;
        @Override public void onSuccess(ChatResponse value) {
            successes++;
            response = value;
            if (throwOnCallback) throw new IllegalStateException("listener details");
        }
        @Override public void onFailure(String code) {
            failures++;
            errorCode = code;
            if (throwOnCallback) throw new IllegalStateException("listener details");
        }
        @Override public void onCancelled() {
            cancellations++;
            if (throwOnCallback) throw new IllegalStateException("listener details");
        }
        int terminalCount() { return successes + failures + cancellations; }
    }

    private static final class Fixture {
        final FakeGateway gateway = new FakeGateway();
        final FakeScheduler scheduler = new FakeScheduler();
        final FakeDispatcher dispatcher = new FakeDispatcher();
        final BridgeCore core = new BridgeCore(gateway, scheduler, dispatcher, TIMEOUT_MS);
    }

    private static ChatRequest request() {
        return new ChatRequest(ID, null, "hello Cortana", null);
    }

    @Test public void acceptsValidTextAndCopiesSelectedMemory() {
        List<String> memory = new ArrayList<>(Arrays.asList("user prefers concise replies"));
        ChatRequest request = new ChatRequest(ID, "conversation-1", "hello", memory);
        memory.clear();
        assertEquals(1, request.getSelectedMemory().size());
        try {
            request.getSelectedMemory().add("mutation");
            fail("memory list must be immutable");
        } catch (UnsupportedOperationException expected) { }
    }

    @Test public void rejectsEmptyTextAndOversizedSelectedMemory() {
        try {
            new ChatRequest(ID, null, "  ", null);
            fail("empty text must be rejected");
        } catch (IllegalArgumentException expected) {
            assertEquals("INVALID_INPUT_TEXT", expected.getMessage());
        }
        try {
            new ChatRequest(ID, null, "hello", Arrays.asList(
                    repeat("a", 1700), repeat("b", 1700), repeat("c", 1700),
                    repeat("d", 1700), repeat("e", 1700)));
            fail("oversized memory must be rejected");
        } catch (IllegalArgumentException expected) {
            assertEquals("MEMORY_CONTEXT_TOO_LARGE", expected.getMessage());
        }
    }

    @Test public void successProducesExactlyOneTerminalCallbackAndCancelsTimeout() {
        Fixture f = new Fixture();
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        f.gateway.callback.onSuccess(new ChatResponse(ID, "Hello back"));
        f.gateway.callback.onFailure();
        f.scheduler.fire();
        assertEquals(1, listener.terminalCount());
        assertEquals(1, listener.successes);
        assertEquals("Hello back", listener.response.getText());
        assertEquals(1, f.scheduler.cancelCalls);
        assertEquals(0, f.gateway.cancelCalls);
        assertEquals(0, f.core.activeRequestCount());
    }

    @Test public void mismatchedResponseIdFailsClosed() {
        Fixture f = new Fixture();
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        f.gateway.callback.onSuccess(new ChatResponse("request-id-00000002", "wrong response"));
        assertEquals(1, listener.failures);
        assertEquals("GATEWAY_REQUEST_FAILED", listener.errorCode);
        assertEquals(0, listener.successes);
        assertEquals(0, f.core.activeRequestCount());
    }

    @Test public void cancellationWinsAndLateGatewayCallbackIsIgnored() {
        Fixture f = new Fixture();
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        assertTrue(f.core.cancel(ID));
        f.gateway.callback.onSuccess(new ChatResponse(ID, "late"));
        f.scheduler.fire();
        assertFalse(f.core.cancel(ID));
        assertEquals(1, f.gateway.cancelCalls);
        assertEquals(1, f.scheduler.cancelCalls);
        assertEquals(1, listener.cancellations);
        assertEquals(1, listener.terminalCount());
    }

    @Test public void duplicateActiveRequestIdIsRejected() {
        Fixture f = new Fixture();
        f.core.submit(request(), new RecordingListener());
        try {
            f.core.submit(request(), new RecordingListener());
            fail("duplicate active request ID must be rejected");
        } catch (IllegalStateException expected) {
            assertEquals("REQUEST_ALREADY_ACTIVE", expected.getMessage());
        }
    }

    @Test public void synchronousGatewayCallbackBeforeCallReturnIsSafe() {
        Fixture f = new Fixture();
        f.gateway.synchronous = true;
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        assertEquals(1, listener.successes);
        assertEquals(0, f.gateway.cancelCalls);
        assertEquals(1, f.scheduler.cancelCalls);
        assertEquals(0, f.core.activeRequestCount());
    }

    @Test public void gatewayExceptionReturnsGenericFailureWithoutLeakingDetails() {
        Fixture f = new Fixture();
        f.gateway.throwOnSend = true;
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        assertEquals(1, listener.failures);
        assertEquals("GATEWAY_REQUEST_FAILED", listener.errorCode);
        assertFalse(listener.errorCode.contains("private"));
        assertEquals(0, f.core.activeRequestCount());
        assertEquals(1, f.scheduler.cancelCalls);
    }

    @Test public void timeoutProducesGenericTimeoutAndCancelsGatewayCall() {
        Fixture f = new Fixture();
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        f.scheduler.fire();
        assertEquals(1, listener.failures);
        assertEquals("REQUEST_TIMEOUT", listener.errorCode);
        assertEquals(1, f.gateway.cancelCalls);
        assertEquals(1, listener.terminalCount());
        assertEquals(0, f.core.activeRequestCount());
    }

    @Test public void successWinsAgainstLaterTimeout() {
        Fixture f = new Fixture();
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        f.gateway.callback.onSuccess(new ChatResponse(ID, "done"));
        f.scheduler.fire();
        assertEquals(1, listener.successes);
        assertEquals(0, listener.failures);
        assertEquals(0, f.gateway.cancelCalls);
        assertEquals(1, listener.terminalCount());
    }

    @Test public void cancellationWinsAgainstLaterTimeout() {
        Fixture f = new Fixture();
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        assertTrue(f.core.cancel(ID));
        f.scheduler.fire();
        assertEquals(1, listener.cancellations);
        assertEquals(0, listener.failures);
        assertEquals(1, listener.terminalCount());
    }

    @Test public void timeoutBeforeGatewayReturnsCancelsLateCallHandle() {
        Fixture f = new Fixture();
        f.gateway.beforeReturn = new Runnable() {
            @Override public void run() { f.scheduler.fire(); }
        };
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        assertEquals(1, listener.failures);
        assertEquals("REQUEST_TIMEOUT", listener.errorCode);
        assertEquals(1, f.gateway.cancelCalls);
        assertEquals(0, f.core.activeRequestCount());
    }

    @Test public void callbackDispatcherCanDeferDeliveryWithoutHoldingRequestActive() {
        Fixture f = new Fixture();
        f.dispatcher.immediate = false;
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        f.gateway.callback.onSuccess(new ChatResponse(ID, "queued"));
        assertEquals(0, listener.terminalCount());
        assertEquals(0, f.core.activeRequestCount());
        f.dispatcher.drain();
        assertEquals(1, listener.successes);
    }

    @Test public void listenerExceptionDoesNotEscapeOrCorruptLifecycle() {
        Fixture f = new Fixture();
        RecordingListener listener = new RecordingListener();
        listener.throwOnCallback = true;
        f.core.submit(request(), listener);
        f.gateway.callback.onSuccess(new ChatResponse(ID, "safe"));
        assertEquals(1, listener.successes);
        assertEquals(0, f.core.activeRequestCount());
        assertEquals(1, f.scheduler.cancelCalls);
    }

    @Test public void dispatcherExceptionDoesNotCorruptTerminalState() {
        Fixture f = new Fixture();
        f.dispatcher.throwOnDispatch = true;
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        f.gateway.callback.onSuccess(new ChatResponse(ID, "safe"));
        assertEquals(0, listener.terminalCount());
        assertEquals(0, f.core.activeRequestCount());
        assertEquals(1, f.scheduler.cancelCalls);
    }

    @Test public void schedulerFailureFailsClosedBeforeGatewaySubmission() {
        Fixture f = new Fixture();
        f.scheduler.throwOnSchedule = true;
        RecordingListener listener = new RecordingListener();
        f.core.submit(request(), listener);
        assertEquals(1, listener.failures);
        assertEquals("GATEWAY_REQUEST_FAILED", listener.errorCode);
        assertNull(f.gateway.callback);
        assertEquals(0, f.core.activeRequestCount());
    }

    private static String repeat(String value, int count) {
        StringBuilder result = new StringBuilder(count);
        for (int i = 0; i < count; i++) result.append(value);
        return result.toString();
    }
}
