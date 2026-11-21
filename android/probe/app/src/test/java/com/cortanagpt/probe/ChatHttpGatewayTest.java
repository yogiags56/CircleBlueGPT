package com.cortanagpt.probe;

import com.cortanagpt.probe.bridge.BridgeCore;
import com.cortanagpt.probe.bridge.ChatHttpGateway;
import com.cortanagpt.probe.bridge.ChatProtocolCodec;
import com.cortanagpt.probe.bridge.ChatRequest;
import com.cortanagpt.probe.bridge.ChatResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.security.Principal;
import java.security.cert.Certificate;
import java.util.concurrent.Executor;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLPeerUnverifiedException;
import org.junit.Test;
import static org.junit.Assert.*;

public class ChatHttpGatewayTest {
    private static final String ID = "request-id-00000001";
    private static final String ENDPOINT = "https://mock.example/v1/chat/completions";

    private static final class DirectExecutor implements Executor {
        @Override public void execute(Runnable command) { command.run(); }
    }

    private static final class QueueExecutor implements Executor {
        Runnable task;
        @Override public void execute(Runnable command) { task = command; }
        void run() { if (task != null) task.run(); }
    }

    private static final class ThreadExecutor implements Executor {
        final CountDownLatch finished = new CountDownLatch(1);
        @Override public void execute(final Runnable command) {
            new Thread(new Runnable() {
                @Override public void run() {
                    try { command.run(); } finally { finished.countDown(); }
                }
            }).start();
        }
    }

    private static final class RecordingCallback implements BridgeCore.Callback {
        int successes;
        int failures;
        ChatResponse response;
        @Override public void onSuccess(ChatResponse value) { successes++; response = value; }
        @Override public void onFailure() { failures++; }
    }

    private static final class FakeHttpsConnection extends HttpsURLConnection {
        int status = 200;
        int contentLengthOverride = Integer.MIN_VALUE;
        byte[] response = response("Hello from mock");
        final ByteArrayOutputStream request = new ByteArrayOutputStream();
        boolean disconnected;
        int inputReads;
        boolean blockInput;
        final CountDownLatch inputEntered = new CountDownLatch(1);
        final CountDownLatch releaseInput = new CountDownLatch(1);

        FakeHttpsConnection() throws Exception { super(new URL(ENDPOINT)); }
        @Override public void connect() { }
        @Override public void disconnect() { disconnected = true; }
        @Override public boolean usingProxy() { return false; }
        @Override public String getCipherSuite() { return "TLS_FAKE"; }
        @Override public Certificate[] getLocalCertificates() { return null; }
        @Override public Certificate[] getServerCertificates() throws SSLPeerUnverifiedException {
            return new Certificate[0];
        }
        @Override public Principal getPeerPrincipal() throws SSLPeerUnverifiedException { return null; }
        @Override public Principal getLocalPrincipal() { return null; }
        @Override public OutputStream getOutputStream() { return request; }
        @Override public InputStream getInputStream() {
            inputReads++;
            if (blockInput) {
                inputEntered.countDown();
                try {
                    if (!releaseInput.await(5, TimeUnit.SECONDS)) throw new RuntimeException("test input wait timeout");
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("test input interrupted");
                }
            }
            return new ByteArrayInputStream(response);
        }
        @Override public int getResponseCode() { return status; }
        @Override public int getContentLength() {
            return contentLengthOverride == Integer.MIN_VALUE ? response.length : contentLengthOverride;
        }
    }

    private static final class Fixture {
        final FakeHttpsConnection connection;
        int openCalls;
        final ChatHttpGateway gateway;
        Fixture(Executor executor) throws Exception {
            connection = new FakeHttpsConnection();
            gateway = new ChatHttpGateway(ENDPOINT, executor, new ChatHttpGateway.ConnectionFactory() {
                @Override public HttpsURLConnection open(URL url) {
                    openCalls++;
                    return connection;
                }
            }, 1234, 2345);
        }
    }

    private static ChatRequest request() {
        return new ChatRequest(ID, "conversation-1", "hello \"Cortana\"", null);
    }

    private static byte[] response(String text) {
        String json = "{\"protocolVersion\":1,\"requestId\":\"" + ID
                + "\",\"message\":{\"text\":\"" + text + "\"}}";
        return json.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    @Test public void sendsBoundedPostAndDecodesMatchingResponse() throws Exception {
        Fixture f = new Fixture(new DirectExecutor());
        RecordingCallback callback = new RecordingCallback();
        f.gateway.send(request(), callback);
        assertEquals(1, callback.successes);
        assertEquals(0, callback.failures);
        assertEquals("Hello from mock", callback.response.getText());
        assertEquals("POST", f.connection.getRequestMethod());
        assertEquals(ID, f.connection.getRequestProperty("Idempotency-Key"));
        assertEquals("application/json", f.connection.getRequestProperty("Accept"));
        assertFalse(f.connection.getInstanceFollowRedirects());
        assertEquals(1234, f.connection.getConnectTimeout());
        assertEquals(2345, f.connection.getReadTimeout());
        assertTrue(f.connection.request.toString("UTF-8").contains("\"protocolVersion\":1"));
        assertTrue(f.connection.disconnected);
    }

    @Test public void rejectsNonHttpsAndCredentialBearingEndpoints() throws Exception {
        try {
            new ChatHttpGateway("http://mock.example/v1/chat/completions",
                    new DirectExecutor(), new ChatHttpGateway.ConnectionFactory() {
                @Override public HttpsURLConnection open(URL url) { return null; }
            });
            fail("cleartext endpoint must be rejected");
        } catch (IllegalArgumentException expected) {
            assertEquals("HTTPS_ENDPOINT_REQUIRED", expected.getMessage());
        }
        try {
            new ChatHttpGateway("https://user:pass@mock.example/v1/chat/completions",
                    new DirectExecutor(), new ChatHttpGateway.ConnectionFactory() {
                @Override public HttpsURLConnection open(URL url) { return null; }
            });
            fail("userinfo must be rejected");
        } catch (IllegalArgumentException expected) {
            assertEquals("HTTPS_ENDPOINT_REQUIRED", expected.getMessage());
        }
    }

    @Test public void rejectsRedirectAndHttpErrorWithoutReadingErrorBody() throws Exception {
        Fixture f = new Fixture(new DirectExecutor());
        f.connection.status = 302;
        RecordingCallback callback = new RecordingCallback();
        f.gateway.send(request(), callback);
        assertEquals(0, callback.successes);
        assertEquals(1, callback.failures);
        assertEquals(0, f.connection.inputReads);
        assertFalse(f.connection.getInstanceFollowRedirects());
    }

    @Test public void malformedJsonAndMismatchedRequestIdFailGenerically() throws Exception {
        Fixture malformed = new Fixture(new DirectExecutor());
        malformed.connection.response = "{bad".getBytes("UTF-8");
        RecordingCallback first = new RecordingCallback();
        malformed.gateway.send(request(), first);
        assertEquals(1, first.failures);

        Fixture mismatch = new Fixture(new DirectExecutor());
        mismatch.connection.response = ("{\"protocolVersion\":1,\"requestId\":\"request-id-00000002"
                + "\",\"message\":{\"text\":\"wrong\"}}").getBytes("UTF-8");
        RecordingCallback second = new RecordingCallback();
        mismatch.gateway.send(request(), second);
        assertEquals(1, second.failures);
    }

    @Test public void oversizedResponseIsRejectedByContentLengthAndStreamingCap() throws Exception {
        Fixture length = new Fixture(new DirectExecutor());
        length.connection.contentLengthOverride = ChatProtocolCodec.MAX_RESPONSE_BYTES + 1;
        RecordingCallback first = new RecordingCallback();
        length.gateway.send(request(), first);
        assertEquals(1, first.failures);
        assertEquals(0, length.connection.inputReads);

        Fixture stream = new Fixture(new DirectExecutor());
        stream.connection.contentLengthOverride = -1;
        stream.connection.response = new byte[ChatProtocolCodec.MAX_RESPONSE_BYTES + 1];
        RecordingCallback second = new RecordingCallback();
        stream.gateway.send(request(), second);
        assertEquals(1, second.failures);
    }

    @Test public void cancellationBeforeWorkerStartsPreventsConnectionAndCallback() throws Exception {
        QueueExecutor executor = new QueueExecutor();
        Fixture f = new Fixture(executor);
        RecordingCallback callback = new RecordingCallback();
        BridgeCore.Call call = f.gateway.send(request(), callback);
        call.cancel();
        executor.run();
        assertEquals(0, f.openCalls);
        assertEquals(0, callback.successes);
        assertEquals(0, callback.failures);
    }

    @Test public void cancellationDuringInFlightReadSuppressesLateCallback() throws Exception {
        ThreadExecutor executor = new ThreadExecutor();
        Fixture f = new Fixture(executor);
        f.connection.blockInput = true;
        RecordingCallback callback = new RecordingCallback();
        BridgeCore.Call call = f.gateway.send(request(), callback);
        assertTrue("worker did not reach response read", f.connection.inputEntered.await(5, TimeUnit.SECONDS));
        call.cancel();
        f.connection.releaseInput.countDown();
        assertTrue("worker did not finish", executor.finished.await(5, TimeUnit.SECONDS));
        assertEquals(0, callback.successes);
        assertEquals(0, callback.failures);
        assertTrue(f.connection.disconnected);
    }

    @Test public void executorRejectionProducesGenericFailure() throws Exception {
        Executor rejecting = new Executor() {
            @Override public void execute(Runnable command) {
                throw new IllegalStateException("executor details");
            }
        };
        Fixture f = new Fixture(rejecting);
        RecordingCallback callback = new RecordingCallback();
        f.gateway.send(request(), callback);
        assertEquals(0, callback.successes);
        assertEquals(1, callback.failures);
    }
}
