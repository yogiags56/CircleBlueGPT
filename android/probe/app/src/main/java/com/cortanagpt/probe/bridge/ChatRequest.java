package com.cortanagpt.probe.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/** Immutable text-only request passed from the Cortana shell adapter to a gateway. */
public final class ChatRequest {
    public static final int PROTOCOL_VERSION = 1;
    private final String requestId;
    private final String conversationId;
    private final String text;
    private final List<String> selectedMemory;

    public ChatRequest(String requestId, String conversationId, String text, List<String> selectedMemory) {
        if (requestId == null || !requestId.matches("[A-Za-z0-9_-]{16,64}")) {
            throw new IllegalArgumentException("INVALID_REQUEST_ID");
        }
        if (conversationId != null && (conversationId.length() == 0 || conversationId.length() > 128)) {
            throw new IllegalArgumentException("INVALID_CONVERSATION_ID");
        }
        if (text == null || text.trim().length() == 0 || text.length() > 16384) {
            throw new IllegalArgumentException("INVALID_INPUT_TEXT");
        }
        List<String> memory = selectedMemory == null ? Collections.<String>emptyList() : selectedMemory;
        if (memory.size() > 10) throw new IllegalArgumentException("TOO_MANY_MEMORY_ITEMS");
        int total = 0;
        List<String> copy = new ArrayList<>();
        for (String item : memory) {
            if (item == null || item.trim().length() == 0 || item.length() > 2048) {
                throw new IllegalArgumentException("INVALID_MEMORY_ITEM");
            }
            total += item.length();
            if (total > 8192) throw new IllegalArgumentException("MEMORY_CONTEXT_TOO_LARGE");
            copy.add(item);
        }
        this.requestId = requestId;
        this.conversationId = conversationId;
        this.text = text;
        this.selectedMemory = Collections.unmodifiableList(copy);
    }

    public static ChatRequest create(String text) {
        return new ChatRequest(UUID.randomUUID().toString(), null, text, null);
    }

    public String getRequestId() { return requestId; }
    public String getConversationId() { return conversationId; }
    public String getText() { return text; }
    public List<String> getSelectedMemory() { return selectedMemory; }
}
