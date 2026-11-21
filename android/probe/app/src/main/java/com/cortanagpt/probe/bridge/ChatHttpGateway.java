package com.cortanagpt.probe.bridge;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.net.URLConnection;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.HttpsURLConnection;

/**
 * Bounded HTTPS transport for the proposed v1 chat route.
 * The executor must be a background executor; never supply the Android main executor.
 * Authentication is intentionally not included until the session protocol is independently reviewed.
 */
public final class ChatHttpGateway implements BridgeCore.Gateway {
    public interface ConnectionFactory {
        HttpsURLConnection open(URL url) throws IOException;
    }

    /** Uses the platform's default HTTPS implementation and certificate validation. */
    public static ConnectionFactory defaultConnectionFactory() {
        return new ConnectionFactory() {
            @Override public HttpsURLConnection open(URL url) throws IOException {
                URLConnection connection = url.openConnection();
                if (!(connection instanceof HttpsURLConnection)) {
                    throw new IOException("HTTPS_CONNECTION_REQUIRED");
                }
                return (HttpsURLConnection) connection;
            }
        };
    }

    public static final int DEFAULT_CONNECT_TIMEOUT_MS = 10000;
    public static final int DEFAULT_READ_TIMEOUT_MS = 30000;
    private static final int BUFFER_SIZE = 8192;

    private final URL endpoint;
    private final Executor executor;
    private final ConnectionFactory connectionFactory;
    private final ChatProtocolCodec codec;
    private final int connectTimeoutMillis;
    private final int readTimeoutMillis;

    public ChatHttpGateway(String endpointUrl, Executor executor, ConnectionFactory connectionFactory,
                           int connectTimeoutMillis, int readTimeoutMillis) {
        this.endpoint = validateEndpoint(endpointUrl);
        if (executor == null) throw new IllegalArgumentException("MISSING_BACKGROUND_EXECUTOR");
        if (connectionFactory == null) throw new IllegalArgumentException("MISSING_CONNECTION_FACTORY");
        if (connectTimeoutMillis <= 0 || connectTimeoutMillis > 120000
                || readTimeoutMillis <= 0 || readTimeoutMillis > 120000) {
            throw new IllegalArgumentException("INVALID_HTTP_TIMEOUT");
        }
        this.executor = executor;
        this.connectionFactory = connectionFactory;
        this.codec = new ChatProtocolCodec();
        this.connectTimeoutMillis = connectTimeoutMillis;
        this.readTimeoutMillis = readTimeoutMillis;
    }

    public ChatHttpGateway(String endpointUrl, Executor executor, ConnectionFactory connectionFactory) {
        this(endpointUrl, executor, connectionFactory,
                DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_READ_TIMEOUT_MS);
    }

    @Override public BridgeCore.Call send(final ChatRequest request, BridgeCore.Callback callback) {
        if (request == null || callback == null) throw new IllegalArgumentException("INVALID_GATEWAY_REQUEST");
        final RequestCall call = new RequestCall(callback);
        try {
            executor.execute(new Runnable() {
                @Override public void run() { call.perform(request); }
            });
        } catch (RuntimeException error) {
            call.fail();
        }
        return call;
    }

    private static URL validateEndpoint(String endpointUrl) {
        if (endpointUrl == null || endpointUrl.trim().length() == 0) {
            throw new IllegalArgumentException("MISSING_HTTPS_ENDPOINT");
        }
        try {
            URL url = new URL(endpointUrl);
            if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getHost() == null
                    || url.getHost().length() == 0 || url.getUserInfo() != null
                    || url.getQuery() != null || url.getRef() != null) {
                throw new IllegalArgumentException("HTTPS_ENDPOINT_REQUIRED");
            }
            return url;
        } catch (IOException error) {
            throw new IllegalArgumentException("INVALID_HTTPS_ENDPOINT");
        }
    }

    private final class RequestCall implements BridgeCore.Call {
        private final BridgeCore.Callback callback;
        private static final int ACTIVE = 0;
        private static final int CANCELLED = 1;
        private static final int COMPLETED = 2;
        private final AtomicInteger lifecycle = new AtomicInteger(ACTIVE);
        private volatile HttpsURLConnection connection;

        RequestCall(BridgeCore.Callback callback) { this.callback = callback; }

        @Override public void cancel() {
            if (!lifecycle.compareAndSet(ACTIVE, CANCELLED)) return;
            HttpsURLConnection current = connection;
            if (current != null) {
                try { current.disconnect(); } catch (RuntimeException ignored) { }
            }
        }

        private boolean isCancelled() { return lifecycle.get() == CANCELLED; }

        void perform(ChatRequest request) {
            if (isCancelled()) return;
            HttpsURLConnection current = null;
            try {
                byte[] requestBody = codec.encodeRequest(request).getBytes(StandardCharsets.UTF_8);
                if (requestBody.length > ChatProtocolCodec.MAX_REQUEST_BYTES) throw new IOException("REQUEST_BODY_TOO_LARGE");

                current = connectionFactory.open(endpoint);
                if (current == null) throw new IOException("CONNECTION_UNAVAILABLE");
                connection = current;
                if (isCancelled()) return;

                current.setRequestMethod("POST");
                current.setDoInput(true);
                current.setDoOutput(true);
                current.setUseCaches(false);
                current.setInstanceFollowRedirects(false);
                current.setConnectTimeout(connectTimeoutMillis);
                current.setReadTimeout(readTimeoutMillis);
                current.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                current.setRequestProperty("Accept", "application/json");
                current.setRequestProperty("Accept-Encoding", "identity");
                current.setRequestProperty("Idempotency-Key", request.getRequestId());
                current.setFixedLengthStreamingMode(requestBody.length);

                try (OutputStream output = current.getOutputStream()) {
                    output.write(requestBody);
                    output.flush();
                }
                if (isCancelled()) return;

                int status = current.getResponseCode();
                if (status != 200) throw new IOException("HTTP_STATUS_REJECTED");
                if (current.getContentLength() > ChatProtocolCodec.MAX_RESPONSE_BYTES) {
                    throw new IOException("RESPONSE_BODY_TOO_LARGE");
                }

                byte[] responseBody;
                try (InputStream input = current.getInputStream()) {
                    responseBody = readBounded(input, ChatProtocolCodec.MAX_RESPONSE_BYTES);
                }
                if (isCancelled()) return;
                String responseJson = decodeUtf8(responseBody);
                ChatResponse response = codec.decodeResponse(responseJson, request.getRequestId());
                succeed(response);
            } catch (IOException | RuntimeException error) {
                fail();
            } finally {
                connection = null;
                if (current != null) {
                    try { current.disconnect(); } catch (RuntimeException ignored) { }
                }
            }
        }

        private void succeed(ChatResponse response) {
            if (isCancelled() || !lifecycle.compareAndSet(ACTIVE, COMPLETED)) return;
            try { callback.onSuccess(response); } catch (RuntimeException ignored) { }
        }

        private void fail() {
            if (isCancelled() || !lifecycle.compareAndSet(ACTIVE, COMPLETED)) return;
            try { callback.onFailure(); } catch (RuntimeException ignored) { }
        }
    }

    private static byte[] readBounded(InputStream input, int maxBytes) throws IOException {
        if (input == null) throw new IOException("MISSING_RESPONSE_BODY");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[BUFFER_SIZE];
        int total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > maxBytes) throw new IOException("RESPONSE_BODY_TOO_LARGE");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private static String decodeUtf8(byte[] bytes) throws IOException {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException error) {
            throw new IOException("INVALID_RESPONSE_ENCODING");
        }
    }
}
