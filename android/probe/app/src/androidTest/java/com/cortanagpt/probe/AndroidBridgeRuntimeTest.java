package com.cortanagpt.probe;

import android.os.Looper;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.cortanagpt.probe.bridge.AndroidBridgeRuntime;
import com.cortanagpt.probe.bridge.ChatHttpGateway;
import com.cortanagpt.probe.bridge.LegacyConversationAdapter;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.HttpsURLConnection;
import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import okhttp3.tls.HandshakeCertificates;
import okhttp3.tls.HeldCertificate;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AndroidBridgeRuntimeTest {
    private static final class TlsFixture implements AutoCloseable {
        final MockWebServer server = new MockWebServer();
        final HandshakeCertificates clientTrust;
        TlsFixture() throws Exception {
            HeldCertificate certificate = new HeldCertificate.Builder()
                    .addSubjectAlternativeName("localhost")
                    .addSubjectAlternativeName("127.0.0.1")
                    .build();
            HandshakeCertificates serverIdentity = new HandshakeCertificates.Builder()
                    .heldCertificate(certificate)
                    .build();
            clientTrust = new HandshakeCertificates.Builder()
                    .addTrustedCertificate(certificate.certificate())
                    .build();
            server.useHttps(serverIdentity.sslSocketFactory(), false);
            server.start();
        }
        AndroidBridgeRuntime runtime() {
            return new AndroidBridgeRuntime(server.url("/v1/chat/completions").toString(), null, 12000L,
                    new ChatHttpGateway.ConnectionFactory() {
                        @Override public HttpsURLConnection open(URL url) throws java.io.IOException {
                            HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
                            connection.setSSLSocketFactory(clientTrust.sslSocketFactory());
                            return connection;
                        }
                    });
        }
        @Override public void close() throws Exception { server.shutdown(); }
    }

    private static final class Listener implements LegacyConversationAdapter.Listener {
        final CountDownLatch terminal = new CountDownLatch(1);
        final AtomicInteger messages = new AtomicInteger();
        final AtomicInteger errors = new AtomicInteger();
        final AtomicInteger cancellations = new AtomicInteger();
        volatile boolean onMain;
        volatile String displayText;
        volatile String errorCode;
        private void finish() {
            onMain = Looper.myLooper() == Looper.getMainLooper();
            terminal.countDown();
        }
        @Override public void onAssistantMessage(LegacyConversationAdapter.LegacyMessage message) {
            messages.incrementAndGet();
            displayText = message.view.displayText;
            finish();
        }
        @Override public void onError(String code) {
            errors.incrementAndGet();
            errorCode = code;
            finish();
        }
        @Override public void onCancelled() {
            cancellations.incrementAndGet();
            finish();
        }
    }

    private static String response(String requestId, String text) {
        return "{\"protocolVersion\":1,\"requestId\":\"" + requestId
                + "\",\"message\":{\"text\":\"" + text + "\"}}";
    }

    private static String requestIdFromBody(String body) {
        String marker = "\"requestId\":\"";
        int start = body.indexOf(marker);
        if (start < 0) return null;
        int valueStart = start + marker.length();
        int end = body.indexOf('"', valueStart);
        return end < 0 ? null : body.substring(valueStart, end);
    }

    @Test public void runtimeOwnsWorkerAndMapsRealHttpsReplyToLegacyView() throws Exception {
        try (TlsFixture tls = new TlsFixture()) {
            final String[] capturedBody = {null};
            tls.server.setDispatcher(new Dispatcher() {
                @Override public MockResponse dispatch(RecordedRequest request) {
                    capturedBody[0] = request.getBody().readUtf8();
                    String requestId = requestIdFromBody(capturedBody[0]);
                    if (requestId == null) return new MockResponse().setResponseCode(400);
                    return new MockResponse().addHeader("Content-Type", "application/json")
                            .setBody(response(requestId, "Hello from runtime"));
                }
            });
            AndroidBridgeRuntime runtime = tls.runtime();
            Listener listener = new Listener();
            String requestId = runtime.sendQuery("Hello Cortana", listener);
            assertNotNull(requestId);
            assertTrue("runtime reply not delivered", listener.terminal.await(8, TimeUnit.SECONDS));
            assertEquals(1, listener.messages.get());
            assertEquals(0, listener.errors.get());
            assertEquals("Hello from runtime", listener.displayText);
            assertTrue("listener must be on main looper", listener.onMain);
            assertNotNull(capturedBody[0]);
            assertTrue(capturedBody[0].contains("\"requestId\":\"" + requestId + "\""));
            RecordedRequest recorded = tls.server.takeRequest(5, TimeUnit.SECONDS);
            assertNotNull(recorded);
            assertEquals("POST", recorded.getMethod());
            runtime.close();
            assertTrue(runtime.isClosed());
        }
    }

    @Test public void closeCancelsActiveRequestAndDeliversOneMainThreadCancellation() throws Exception {
        try (TlsFixture tls = new TlsFixture()) {
            tls.server.enqueue(new MockResponse().setBodyDelay(5, TimeUnit.SECONDS)
                    .setBody("{\"protocolVersion\":1,\"requestId\":\"late\",\"message\":{\"text\":\"late\"}}"));
            AndroidBridgeRuntime runtime = tls.runtime();
            Listener listener = new Listener();
            assertNotNull(runtime.sendQuery("cancel during read", listener));
            assertNotNull(tls.server.takeRequest(5, TimeUnit.SECONDS));
            runtime.close();
            assertTrue(listener.terminal.await(5, TimeUnit.SECONDS));
            assertEquals(0, listener.messages.get());
            assertEquals(0, listener.errors.get());
            assertEquals(1, listener.cancellations.get());
            assertTrue(listener.onMain);
            assertTrue(runtime.isClosed());
        }
    }

    @Test public void closedRuntimeRejectsNewQueriesOnMainThreadAndCloseIsIdempotent() throws Exception {
        try (TlsFixture tls = new TlsFixture()) {
            AndroidBridgeRuntime runtime = tls.runtime();
            runtime.close();
            runtime.close();
            Listener listener = new Listener();
            assertNull(runtime.sendQuery("after close", listener));
            assertTrue(listener.terminal.await(5, TimeUnit.SECONDS));
            assertEquals(1, listener.errors.get());
            assertEquals("BRIDGE_CLOSED", listener.errorCode);
            assertTrue(listener.onMain);
        }
    }

    @Test public void resetConversationClearsLocalConversationId() throws Exception {
        try (TlsFixture tls = new TlsFixture()) {
            AndroidBridgeRuntime runtime = tls.runtime();
            runtime.setConversationId("conversation-runtime");
            assertEquals("conversation-runtime", runtime.getConversationId());
            runtime.resetConversation();
            assertNull(runtime.getConversationId());
            runtime.close();
        }
    }
}
