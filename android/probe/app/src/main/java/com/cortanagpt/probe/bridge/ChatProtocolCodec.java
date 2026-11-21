package com.cortanagpt.probe.bridge;

import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import com.google.gson.stream.JsonWriter;
import java.io.IOException;
import java.io.StringReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/** Strict, bounded JSON mapping for the proposed CortanaGPT protocol version 1. */
public final class ChatProtocolCodec {
    public static final int MAX_REQUEST_BYTES = 64 * 1024;
    public static final int MAX_RESPONSE_BYTES = 256 * 1024;
    private static final int MAX_RESPONSE_TEXT_CHARS = 65536;

    public String encodeRequest(ChatRequest request) throws IOException {
        if (request == null) throw new IllegalArgumentException("MISSING_CHAT_REQUEST");
        StringWriter output = new StringWriter();
        JsonWriter writer = new JsonWriter(output);
        writer.setLenient(false);
        writer.beginObject();
        writer.name("protocolVersion").value(ChatRequest.PROTOCOL_VERSION);
        writer.name("requestId").value(request.getRequestId());
        if (request.getConversationId() != null) {
            writer.name("conversationId").value(request.getConversationId());
        }
        writer.name("input").beginObject();
        writer.name("text").value(request.getText());
        writer.endObject();
        writer.name("context").beginObject();
        writer.name("selectedMemory").beginArray();
        for (String item : request.getSelectedMemory()) writer.value(item);
        writer.endArray();
        writer.endObject();
        writer.endObject();
        writer.flush();

        String json = output.toString();
        if (json.getBytes(StandardCharsets.UTF_8).length > MAX_REQUEST_BYTES) {
            throw new IOException("REQUEST_BODY_TOO_LARGE");
        }
        return json;
    }

    public ChatResponse decodeResponse(String json, String expectedRequestId) throws IOException {
        if (json == null || expectedRequestId == null) throw new IOException("INVALID_RESPONSE");
        if (json.getBytes(StandardCharsets.UTF_8).length > MAX_RESPONSE_BYTES) {
            throw new IOException("RESPONSE_BODY_TOO_LARGE");
        }

        int protocolVersion = -1;
        String requestId = null;
        String responseText = null;
        Set<String> rootFields = new HashSet<>();

        try {
            JsonReader reader = new JsonReader(new StringReader(json));
            reader.setLenient(false);
            reader.beginObject();
            while (reader.hasNext()) {
                String name = reader.nextName();
                if (!rootFields.add(name)) throw new IOException("DUPLICATE_RESPONSE_FIELD");
                if ("protocolVersion".equals(name)) {
                    if (reader.peek() != JsonToken.NUMBER) throw new IOException("INVALID_PROTOCOL_VERSION");
                    protocolVersion = reader.nextInt();
                } else if ("requestId".equals(name)) {
                    if (reader.peek() != JsonToken.STRING) throw new IOException("INVALID_RESPONSE_REQUEST_ID");
                    requestId = reader.nextString();
                } else if ("message".equals(name)) {
                    responseText = readMessage(reader);
                } else {
                    throw new IOException("UNSUPPORTED_RESPONSE_FIELD");
                }
            }
            reader.endObject();
            if (reader.peek() != JsonToken.END_DOCUMENT) throw new IOException("TRAILING_RESPONSE_DATA");
        } catch (IllegalStateException | NumberFormatException error) {
            throw new IOException("MALFORMED_RESPONSE");
        }

        if (protocolVersion != ChatRequest.PROTOCOL_VERSION) throw new IOException("UNSUPPORTED_PROTOCOL_VERSION");
        if (requestId == null || !expectedRequestId.equals(requestId)) {
            throw new IOException("RESPONSE_REQUEST_ID_MISMATCH");
        }
        if (responseText == null || responseText.trim().length() == 0
                || responseText.length() > MAX_RESPONSE_TEXT_CHARS) {
            throw new IOException("INVALID_RESPONSE_TEXT");
        }
        try {
            return new ChatResponse(requestId, responseText);
        } catch (IllegalArgumentException error) {
            throw new IOException("INVALID_RESPONSE");
        }
    }

    private String readMessage(JsonReader reader) throws IOException {
        String text = null;
        Set<String> fields = new HashSet<>();
        reader.beginObject();
        while (reader.hasNext()) {
            String name = reader.nextName();
            if (!fields.add(name)) throw new IOException("DUPLICATE_MESSAGE_FIELD");
            if (!"text".equals(name)) throw new IOException("UNSUPPORTED_MESSAGE_FIELD");
            if (reader.peek() != JsonToken.STRING) throw new IOException("INVALID_RESPONSE_TEXT");
            text = reader.nextString();
        }
        reader.endObject();
        if (!fields.contains("text")) throw new IOException("MISSING_RESPONSE_TEXT");
        return text;
    }
}
