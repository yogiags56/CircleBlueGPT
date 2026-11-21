package com.cortanagpt.probe;

import com.cortanagpt.probe.bridge.ChatProtocolCodec;
import com.cortanagpt.probe.bridge.ChatRequest;
import com.cortanagpt.probe.bridge.ChatResponse;
import java.io.IOException;
import org.junit.Test;
import static org.junit.Assert.*;

public class ChatProtocolCodecTest {
    private static final String ID = "request-id-00000001";
    private final ChatProtocolCodec codec = new ChatProtocolCodec();

    @Test public void requestEncodingPreservesTextAndSelectedMemory() throws Exception {
        ChatRequest request = new ChatRequest(ID, "conversation-7",
                "Hello \"Cortana\"\nsecond line", java.util.Arrays.asList("likes matcha"));
        String json = codec.encodeRequest(request);
        assertTrue(json.contains("\"protocolVersion\":1"));
        assertTrue(json.contains("\"requestId\":\"" + ID + "\""));
        assertTrue(json.contains("\"conversationId\":\"conversation-7\""));
        assertTrue(json.contains("Hello \\\"Cortana\\\"\\nsecond line"));
        assertTrue(json.contains("\"selectedMemory\":[\"likes matcha\"]"));
    }

    @Test public void responseDecodesOnlyMatchingVersionOneRequest() throws Exception {
        ChatResponse response = codec.decodeResponse(
                "{\"protocolVersion\":1,\"requestId\":\"" + ID + "\",\"message\":{\"text\":\"Hello back\"}}", ID);
        assertEquals(ID, response.getRequestId());
        assertEquals("Hello back", response.getText());
    }

    @Test public void rejectsMalformedAndTrailingJson() {
        expectIOException("{not-json}", "MALFORMED_RESPONSE");
        expectIOException(valid("ok") + " garbage", "TRAILING_RESPONSE_DATA");
    }

    @Test public void rejectsDuplicateAndUnknownFields() {
        expectIOException("{\"protocolVersion\":1,\"protocolVersion\":1,\"requestId\":\"" + ID
                + "\",\"message\":{\"text\":\"ok\"}}", "DUPLICATE_RESPONSE_FIELD");
        expectIOException("{\"protocolVersion\":1,\"requestId\":\"" + ID
                + "\",\"message\":{\"text\":\"ok\",\"tool\":{}}}", "UNSUPPORTED_MESSAGE_FIELD");
        expectIOException("{\"protocolVersion\":1,\"requestId\":\"" + ID
                + "\",\"message\":{\"text\":\"ok\"},\"provider\":{}}", "UNSUPPORTED_RESPONSE_FIELD");
    }

    @Test public void rejectsUnsupportedProtocolAndMismatchedRequestId() {
        expectIOException("{\"protocolVersion\":2,\"requestId\":\"" + ID
                + "\",\"message\":{\"text\":\"ok\"}}", "UNSUPPORTED_PROTOCOL_VERSION");
        expectIOException("{\"protocolVersion\":1,\"requestId\":\"request-id-00000002"
                + "\",\"message\":{\"text\":\"ok\"}}", "RESPONSE_REQUEST_ID_MISMATCH");
    }

    @Test public void rejectsEmptyAndOversizedResponseText() {
        expectIOException(valid("  "), "INVALID_RESPONSE_TEXT");
        expectIOException(valid(repeat("x", 65537)), "INVALID_RESPONSE_TEXT");
    }

    @Test public void rejectsOversizedResponseBodyBeforeParsing() {
        String json = repeat(" ", ChatProtocolCodec.MAX_RESPONSE_BYTES + 1) + valid("ok");
        expectIOException(json, "RESPONSE_BODY_TOO_LARGE");
    }

    @Test public void requestEncodingIsBounded() throws Exception {
        ChatRequest request = new ChatRequest(ID, null, repeat("x", 16384),
                java.util.Collections.<String>emptyList());
        assertTrue(codec.encodeRequest(request).getBytes("UTF-8").length <= ChatProtocolCodec.MAX_REQUEST_BYTES);
    }

    private static String valid(String text) {
        return "{\"protocolVersion\":1,\"requestId\":\"" + ID
                + "\",\"message\":{\"text\":\"" + escape(text) + "\"}}";
    }

    private void expectIOException(String json, String code) {
        try {
            codec.decodeResponse(json, ID);
            fail("expected " + code);
        } catch (IOException expected) {
            assertEquals(code, expected.getMessage());
        }
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }

    private static String repeat(String value, int count) {
        StringBuilder result = new StringBuilder(count);
        for (int i = 0; i < count; i++) result.append(value);
        return result.toString();
    }
}
