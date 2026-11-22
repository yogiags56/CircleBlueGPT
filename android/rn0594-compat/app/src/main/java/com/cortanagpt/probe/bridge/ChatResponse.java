package com.cortanagpt.probe.bridge;

/** Narrow response DTO; provider metadata and tool/action payloads are intentionally absent. */
public final class ChatResponse {
    private final String requestId;
    private final String text;

    public ChatResponse(String requestId, String text) {
        if (requestId == null || !requestId.matches("[A-Za-z0-9_-]{16,64}")) {
            throw new IllegalArgumentException("INVALID_RESPONSE_REQUEST_ID");
        }
        if (text == null || text.trim().length() == 0 || text.length() > 65536) {
            throw new IllegalArgumentException("INVALID_RESPONSE_TEXT");
        }
        this.requestId = requestId;
        this.text = text;
    }

    public String getRequestId() { return requestId; }
    public String getText() { return text; }
}
