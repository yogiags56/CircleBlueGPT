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

    private static final class FakeGateway implements BridgeCore.Gateway {
        BridgeCore.Callback callback;
        int cancelCalls;
        boolean synchronous;
        boolean throwOnSend;
        @Override public BridgeCore.Call send(ChatRequest request, BridgeCore.Callback callback) {
            this.callback = callback;
            if (throwOnSend) throw new IllegalStateException("private gateway details");
            if (synchronous) callback.onSuccess(new ChatResponse(request.getRequestId(), "hello"));
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
        @Override public void onSuccess(ChatResponse value) { successes++; response = value; }
        @Override public void onFailure(String code) { failures++; errorCode = code; }
        @Override public void onCancelled() { cancellations++; }
        int terminalCount() { return successes + failures + cancellations; }
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

    @Test public void successProducesExactlyOneTerminalCallback() {
        FakeGateway gateway = new FakeGateway();
        BridgeCore core = new BridgeCore(gateway);
        RecordingListener listener = new RecordingListener();
        core.submit(request(), listener);
        gateway.callback.onSuccess(new ChatResponse(ID, "Hello back"));
        gateway.callback.onFailure();
        assertEquals(1, listener.terminalCount());
        assertEquals(1, listener.successes);
        assertEquals("Hello back", listener.response.getText());
        assertEquals(0, core.activeRequestCount());
    }

    @Test public void mismatchedResponseIdFailsClosed() {
        FakeGateway gateway = new FakeGateway();
        BridgeCore core = new BridgeCore(gateway);
        RecordingListener listener = new RecordingListener();
        core.submit(request(), listener);
        gateway.callback.onSuccess(new ChatResponse("request-id-00000002", "wrong response"));
        assertEquals(1, listener.failures);
        assertEquals("GATEWAY_REQUEST_FAILED", listener.errorCode);
        assertEquals(0, listener.successes);
    }

    @Test public void cancellationWinsAndLateGatewayCallbackIsIgnored() {
        FakeGateway gateway = new FakeGateway();
        BridgeCore core = new BridgeCore(gateway);
        RecordingListener listener = new RecordingListener();
        core.submit(request(), listener);
        assertTrue(core.cancel(ID));
        gateway.callback.onSuccess(new ChatResponse(ID, "late"));
        assertFalse(core.cancel(ID));
        assertEquals(1, gateway.cancelCalls);
        assertEquals(1, listener.cancellations);
        assertEquals(1, listener.terminalCount());
    }

    @Test public void duplicateActiveRequestIdIsRejected() {
        FakeGateway gateway = new FakeGateway();
        BridgeCore core = new BridgeCore(gateway);
        core.submit(request(), new RecordingListener());
        try {
            core.submit(request(), new RecordingListener());
            fail("duplicate active request ID must be rejected");
        } catch (IllegalStateException expected) {
            assertEquals("REQUEST_ALREADY_ACTIVE", expected.getMessage());
        }
    }

    @Test public void synchronousGatewayCallbackBeforeCallReturnIsSafe() {
        FakeGateway gateway = new FakeGateway();
        gateway.synchronous = true;
        BridgeCore core = new BridgeCore(gateway);
        RecordingListener listener = new RecordingListener();
        core.submit(request(), listener);
        assertEquals(1, listener.successes);
        assertEquals(0, gateway.cancelCalls);
        assertEquals(0, core.activeRequestCount());
    }

    @Test public void gatewayExceptionReturnsGenericFailureWithoutLeakingDetails() {
        FakeGateway gateway = new FakeGateway();
        gateway.throwOnSend = true;
        BridgeCore core = new BridgeCore(gateway);
        RecordingListener listener = new RecordingListener();
        core.submit(request(), listener);
        assertEquals(1, listener.failures);
        assertEquals("GATEWAY_REQUEST_FAILED", listener.errorCode);
        assertFalse(listener.errorCode.contains("private"));
        assertEquals(0, core.activeRequestCount());
    }

    private static String repeat(String value, int count) {
        StringBuilder result = new StringBuilder(count);
        for (int i = 0; i < count; i++) result.append(value);
        return result.toString();
    }
}
