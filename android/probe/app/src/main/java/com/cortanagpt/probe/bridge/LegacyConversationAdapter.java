package com.cortanagpt.probe.bridge;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * Platform-neutral adapter for the legacy NewmanViewModule text conversation surface.
 * It maps only assistant text into view.displayText; skills/cards/voice remain unsupported.
 */
public final class LegacyConversationAdapter {
    public interface SelectedMemoryProvider {
        List<String> selectFor(String userText);
    }

    public interface Listener {
        void onAssistantMessage(LegacyMessage message);
        void onError(String errorCode);
        void onCancelled();
    }

    /** Minimal legacy-compatible response shape consumed by the text display surface. */
    public static final class LegacyMessage {
        public final View view;
        private LegacyMessage(String displayText) {
            this.view = new View(displayText);
        }
        public static final class View {
            public final String displayText;
            private View(String displayText) { this.displayText = displayText; }
        }
    }

    private final Object lock = new Object();
    private final BridgeCore bridge;
    private final SelectedMemoryProvider memoryProvider;
    private String conversationId;
    private String activeRequestId;
    private Listener activeListener;
    private long generation;

    public LegacyConversationAdapter(BridgeCore bridge, SelectedMemoryProvider memoryProvider) {
        if (bridge == null) throw new IllegalArgumentException("MISSING_BRIDGE");
        this.bridge = bridge;
        this.memoryProvider = memoryProvider;
    }

    public void setConversationId(String conversationId) {
        if (conversationId != null && (conversationId.length() == 0 || conversationId.length() > 128)) {
            throw new IllegalArgumentException("INVALID_CONVERSATION_ID");
        }
        synchronized (lock) {
            if (activeRequestId != null) throw new IllegalStateException("REQUEST_ACTIVE");
            this.conversationId = conversationId;
        }
    }

    public String getConversationId() {
        synchronized (lock) { return conversationId; }
    }

    public String getActiveRequestId() {
        synchronized (lock) { return activeRequestId; }
    }

    /** NewmanViewModule.sendQuery adapter. Replaces and cancels any prior active text query. */
    public String sendQuery(String text, Listener listener) {
        if (listener == null) throw new IllegalArgumentException("MISSING_LISTENER");
        if (text == null || text.trim().length() == 0 || text.length() > 16384) {
            notifyError(listener, "INVALID_USER_INPUT");
            return null;
        }

        List<String> selectedMemory = Collections.emptyList();
        try {
            if (memoryProvider != null) {
                List<String> selected = memoryProvider.selectFor(text);
                if (selected != null) selectedMemory = selected;
            }
        } catch (RuntimeException error) {
            notifyError(listener, "MEMORY_SELECTION_FAILED");
            return null;
        }

        final String requestId = UUID.randomUUID().toString();
        final ChatRequest request;
        final String requestConversationId;
        try {
            synchronized (lock) { requestConversationId = conversationId; }
            request = new ChatRequest(requestId, requestConversationId, text, selectedMemory);
        } catch (IllegalArgumentException error) {
            notifyError(listener, "INVALID_USER_INPUT");
            return null;
        }

        final String previousId;
        final Listener previousListener;
        final long requestGeneration;
        synchronized (lock) {
            previousId = activeRequestId;
            previousListener = activeListener;
            activeRequestId = requestId;
            activeListener = listener;
            requestGeneration = ++generation;
        }

        if (previousId != null) {
            bridge.cancel(previousId);
            notifyCancelled(previousListener);
        }

        try {
            bridge.submit(request, new BridgeCore.Listener() {
                @Override public void onSuccess(ChatResponse response) {
                    if (!claim(requestId, requestGeneration)) return;
                    notifyMessage(listener, new LegacyMessage(response.getText()));
                }
                @Override public void onFailure(String errorCode) {
                    if (!claim(requestId, requestGeneration)) return;
                    notifyError(listener, errorCode);
                }
                @Override public void onCancelled() {
                    if (!claim(requestId, requestGeneration)) return;
                    notifyCancelled(listener);
                }
            });
        } catch (RuntimeException error) {
            if (claim(requestId, requestGeneration)) notifyError(listener, "CHAT_SUBMISSION_FAILED");
            return null;
        }
        return requestId;
    }

    /** NewmanViewModule.onUserManualInput adapter; text input shares the same validated path. */
    public String onUserManualInput(String text, Listener listener) {
        return sendQuery(text, listener);
    }

    /** NewmanViewModule.cancelListening adapter. The UI receives one cancellation even if a reply is queued. */
    public boolean cancelListening() {
        final String requestId;
        final Listener listener;
        synchronized (lock) {
            if (activeRequestId == null) return false;
            requestId = activeRequestId;
            listener = activeListener;
            activeRequestId = null;
            activeListener = null;
            generation++;
        }
        bridge.cancel(requestId);
        notifyCancelled(listener);
        return true;
    }

    /** NewmanViewModule.resetConversation adapter; cancels pending text and clears conversation identity. */
    public void resetConversation() {
        final String requestId;
        final Listener listener;
        synchronized (lock) {
            requestId = activeRequestId;
            listener = activeListener;
            activeRequestId = null;
            activeListener = null;
            conversationId = null;
            generation++;
        }
        if (requestId != null) {
            bridge.cancel(requestId);
            notifyCancelled(listener);
        }
    }

    /** Legacy force-reset alias; it never reuses Microsoft connection or authentication state. */
    public void forceResetConnection() {
        resetConversation();
    }

    /** Voice is intentionally outside the text-only MVP. */
    public boolean startListening(Listener listener) {
        notifyError(listener, "VOICE_INPUT_NOT_SUPPORTED");
        return false;
    }

    /** Adaptive cards can carry actions; they are deliberately rejected in the MVP. */
    public boolean onAdaptiveCardSubmit(Listener listener) {
        notifyError(listener, "UNSUPPORTED_LEGACY_ACTION");
        return false;
    }

    /** Legacy skills/actions are never forwarded to the new gateway. */
    public boolean sendSkillEvent(Listener listener) {
        notifyError(listener, "UNSUPPORTED_LEGACY_ACTION");
        return false;
    }

    private boolean claim(String requestId, long requestGeneration) {
        synchronized (lock) {
            if (activeRequestId == null || !activeRequestId.equals(requestId)
                    || generation != requestGeneration) return false;
            activeRequestId = null;
            activeListener = null;
            return true;
        }
    }

    private static void notifyMessage(Listener listener, LegacyMessage message) {
        if (listener == null) return;
        try { listener.onAssistantMessage(message); } catch (RuntimeException ignored) { }
    }

    private static void notifyError(Listener listener, String errorCode) {
        if (listener == null) return;
        try { listener.onError(errorCode); } catch (RuntimeException ignored) { }
    }

    private static void notifyCancelled(Listener listener) {
        if (listener == null) return;
        try { listener.onCancelled(); } catch (RuntimeException ignored) { }
    }
}
