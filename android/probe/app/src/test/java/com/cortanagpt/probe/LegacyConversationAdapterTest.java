package com.cortanagpt.probe;

import com.cortanagpt.probe.bridge.BridgeCore;
import com.cortanagpt.probe.bridge.ChatRequest;
import com.cortanagpt.probe.bridge.ChatResponse;
import com.cortanagpt.probe.bridge.LegacyConversationAdapter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

public class LegacyConversationAdapterTest {
    private static final class FakeScheduler implements BridgeCore.TimeoutScheduler {
        int cancelled;
        @Override public BridgeCore.Cancellable schedule(Runnable task, long delayMillis) {
            return new BridgeCore.Cancellable() {
                @Override public void cancel() { cancelled++; }
            };
        }
    }

    private static final class FakeGateway implements BridgeCore.Gateway {
        final Map<String, BridgeCore.Callback> callbacks = new HashMap<>();
        final Map<String, Integer> cancelCounts = new HashMap<>();
        final Map<String, ChatRequest> requests = new HashMap<>();
        @Override public BridgeCore.Call send(ChatRequest request, BridgeCore.Callback callback) {
            final String id = request.getRequestId();
            callbacks.put(id, callback);
            requests.put(id, request);
            cancelCounts.put(id, 0);
            return new BridgeCore.Call() {
                @Override public void cancel() { cancelCounts.put(id, cancelCounts.get(id) + 1); }
            };
        }
        void succeed(String id, String text) {
            callbacks.get(id).onSuccess(new ChatResponse(id, text));
        }
        void fail(String id) { callbacks.get(id).onFailure(); }
    }

    private static final class RecordingListener implements LegacyConversationAdapter.Listener {
        int messages;
        int errors;
        int cancellations;
        String displayText;
        String errorCode;
        boolean throwOnCallback;
        @Override public void onAssistantMessage(LegacyConversationAdapter.LegacyMessage message) {
            messages++;
            displayText = message.view.displayText;
            if (throwOnCallback) throw new IllegalStateException("listener");
        }
        @Override public void onError(String code) {
            errors++;
            errorCode = code;
            if (throwOnCallback) throw new IllegalStateException("listener");
        }
        @Override public void onCancelled() {
            cancellations++;
            if (throwOnCallback) throw new IllegalStateException("listener");
        }
        int terminalCount() { return messages + errors + cancellations; }
    }

    private static final class Fixture {
        final FakeGateway gateway = new FakeGateway();
        final FakeScheduler scheduler = new FakeScheduler();
        final BridgeCore bridge = new BridgeCore(gateway, scheduler,
                new BridgeCore.CallbackDispatcher() {
                    @Override public void dispatch(Runnable callback) { callback.run(); }
                }, 30000L);
        final LegacyConversationAdapter adapter;
        Fixture(LegacyConversationAdapter.SelectedMemoryProvider memory) {
            adapter = new LegacyConversationAdapter(bridge, memory);
        }
        Fixture() { this(null); }
    }

    @Test public void sendQueryMapsOnlyAssistantTextIntoLegacyDisplayShape() {
        Fixture f = new Fixture(new LegacyConversationAdapter.SelectedMemoryProvider() {
            @Override public List<String> selectFor(String text) {
                return Arrays.asList("user likes cats");
            }
        });
        f.adapter.setConversationId("conversation-legacy-1");
        RecordingListener listener = new RecordingListener();
        String id = f.adapter.sendQuery("Hello Cortana", listener);
        assertNotNull(id);
        ChatRequest request = f.gateway.requests.get(id);
        assertEquals("Hello Cortana", request.getText());
        assertEquals("conversation-legacy-1", request.getConversationId());
        assertEquals(Arrays.asList("user likes cats"), request.getSelectedMemory());

        f.gateway.succeed(id, "Hello. How can I help?");
        assertEquals(1, listener.messages);
        assertEquals("Hello. How can I help?", listener.displayText);
        assertEquals(0, listener.errors);
        assertNull(f.adapter.getActiveRequestId());
    }

    @Test public void onUserManualInputUsesSameValidatedTextPath() {
        Fixture f = new Fixture();
        RecordingListener listener = new RecordingListener();
        String id = f.adapter.onUserManualInput("manual text", listener);
        assertNotNull(id);
        assertEquals("manual text", f.gateway.requests.get(id).getText());
        f.gateway.succeed(id, "manual response");
        assertEquals(1, listener.messages);
        assertEquals("manual response", listener.displayText);
    }

    @Test public void cancelListeningEmitsOneCancelAndSuppressesLateSuccess() {
        Fixture f = new Fixture();
        RecordingListener listener = new RecordingListener();
        String id = f.adapter.sendQuery("cancel me", listener);
        assertTrue(f.adapter.cancelListening());
        assertEquals(1, listener.cancellations);
        assertEquals(1, f.gateway.cancelCounts.get(id).intValue());
        f.gateway.succeed(id, "late answer");
        f.gateway.fail(id);
        assertEquals(1, listener.terminalCount());
        assertNull(f.adapter.getActiveRequestId());
        assertFalse(f.adapter.cancelListening());
    }

    @Test public void resetConversationClearsIdentityAndCancelsPendingRequest() {
        Fixture f = new Fixture();
        f.adapter.setConversationId("conversation-to-reset");
        RecordingListener listener = new RecordingListener();
        String id = f.adapter.sendQuery("pending", listener);
        f.adapter.resetConversation();
        assertNull(f.adapter.getConversationId());
        assertNull(f.adapter.getActiveRequestId());
        assertEquals(1, listener.cancellations);
        assertEquals(1, f.gateway.cancelCounts.get(id).intValue());
        f.gateway.succeed(id, "late");
        assertEquals(1, listener.terminalCount());
    }

    @Test public void newQueryCancelsPriorQueryAndIgnoresItsLateResponse() {
        Fixture f = new Fixture();
        RecordingListener first = new RecordingListener();
        RecordingListener second = new RecordingListener();
        String firstId = f.adapter.sendQuery("first", first);
        String secondId = f.adapter.sendQuery("second", second);
        assertNotEquals(firstId, secondId);
        assertEquals(1, first.cancellations);
        assertEquals(1, f.gateway.cancelCounts.get(firstId).intValue());
        f.gateway.succeed(firstId, "stale");
        f.gateway.succeed(secondId, "current");
        assertEquals(1, first.terminalCount());
        assertEquals(1, second.messages);
        assertEquals("current", second.displayText);
    }

    @Test public void cancellationListenerCanReenterWithoutLeavingOrphanRequest() {
        final Fixture f = new Fixture();
        final RecordingListener third = new RecordingListener();
        final String[] thirdId = {null};
        RecordingListener first = new RecordingListener() {
            @Override public void onCancelled() {
                super.onCancelled();
                thirdId[0] = f.adapter.sendQuery("third", third);
            }
        };
        RecordingListener second = new RecordingListener();
        f.adapter.sendQuery("first", first);
        String secondId = f.adapter.sendQuery("second", second);
        assertNotNull(thirdId[0]);
        assertEquals(1, first.cancellations);
        assertEquals(1, second.cancellations);
        assertEquals(1, f.gateway.cancelCounts.get(secondId).intValue());
        assertEquals(thirdId[0], f.adapter.getActiveRequestId());
        f.gateway.succeed(secondId, "stale second response");
        f.gateway.succeed(thirdId[0], "third response");
        assertEquals(0, second.messages);
        assertEquals(1, third.messages);
        assertEquals("third response", third.displayText);
        assertEquals(0, f.bridge.activeRequestCount());
    }

    @Test public void invalidTextFailsBeforeMemorySelectionOrGateway() {
        final int[] memoryCalls = {0};
        Fixture f = new Fixture(new LegacyConversationAdapter.SelectedMemoryProvider() {
            @Override public List<String> selectFor(String text) {
                memoryCalls[0]++;
                return CollectionsForTest.one();
            }
        });
        RecordingListener listener = new RecordingListener();
        assertNull(f.adapter.sendQuery("  ", listener));
        assertNull(f.adapter.sendQuery(repeat("x", 16385), listener));
        assertEquals(0, memoryCalls[0]);
        assertEquals(2, listener.errors);
        assertEquals("INVALID_USER_INPUT", listener.errorCode);
        assertTrue(f.gateway.requests.isEmpty());
    }

    @Test public void memorySelectionFailureIsMappedWithoutLeakingException() {
        Fixture f = new Fixture(new LegacyConversationAdapter.SelectedMemoryProvider() {
            @Override public List<String> selectFor(String text) {
                throw new IllegalStateException("private memory details");
            }
        });
        RecordingListener listener = new RecordingListener();
        assertNull(f.adapter.sendQuery("hello", listener));
        assertEquals(1, listener.errors);
        assertEquals("MEMORY_SELECTION_FAILED", listener.errorCode);
        assertTrue(f.gateway.requests.isEmpty());
    }

    @Test public void invalidSelectedMemoryIsRejectedByRequestDto() {
        Fixture f = new Fixture(new LegacyConversationAdapter.SelectedMemoryProvider() {
            @Override public List<String> selectFor(String text) {
                return Arrays.asList(repeat("x", 2049));
            }
        });
        RecordingListener listener = new RecordingListener();
        assertNull(f.adapter.sendQuery("hello", listener));
        assertEquals(1, listener.errors);
        assertEquals("INVALID_USER_INPUT", listener.errorCode);
        assertTrue(f.gateway.requests.isEmpty());
    }

    @Test public void legacyVoiceCardsAndSkillsAreExplicitlyUnsupported() {
        Fixture f = new Fixture();
        RecordingListener listener = new RecordingListener();
        assertFalse(f.adapter.startListening(listener));
        assertEquals("VOICE_INPUT_NOT_SUPPORTED", listener.errorCode);
        assertFalse(f.adapter.onAdaptiveCardSubmit(listener));
        assertEquals("UNSUPPORTED_LEGACY_ACTION", listener.errorCode);
        assertFalse(f.adapter.sendSkillEvent(listener));
        assertEquals(3, listener.errors);
        assertEquals(0, listener.messages);
        assertTrue(f.gateway.requests.isEmpty());
    }

    @Test public void forceResetAliasUsesLocalResetWithoutMicrosoftReconnect() {
        Fixture f = new Fixture();
        f.adapter.setConversationId("conversation-2");
        RecordingListener listener = new RecordingListener();
        String id = f.adapter.sendQuery("pending", listener);
        f.adapter.forceResetConnection();
        assertNull(f.adapter.getConversationId());
        assertEquals(1, listener.cancellations);
        assertEquals(1, f.gateway.cancelCounts.get(id).intValue());
    }

    @Test public void listenerExceptionsDoNotCorruptAdapterState() {
        Fixture f = new Fixture();
        RecordingListener listener = new RecordingListener();
        listener.throwOnCallback = true;
        String id = f.adapter.sendQuery("hello", listener);
        f.gateway.succeed(id, "safe reply");
        assertEquals(1, listener.messages);
        assertNull(f.adapter.getActiveRequestId());
        RecordingListener invalid = new RecordingListener();
        invalid.throwOnCallback = true;
        assertNull(f.adapter.sendQuery("", invalid));
        assertEquals(1, invalid.errors);
    }

    private static String repeat(String value, int count) {
        StringBuilder result = new StringBuilder(count);
        for (int i = 0; i < count; i++) result.append(value);
        return result.toString();
    }

    private static final class CollectionsForTest {
        static List<String> one() { return java.util.Collections.singletonList("selected"); }
    }
}
