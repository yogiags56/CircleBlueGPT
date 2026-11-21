package com.cortanagpt.probe;

import com.cortanagpt.probe.bridge.BridgeCore;
import com.cortanagpt.probe.bridge.ChatHttpGateway;
import com.cortanagpt.probe.bridge.ChatRequest;
import com.cortanagpt.probe.bridge.ChatResponse;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.HttpsURLConnection;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import okhttp3.tls.HandshakeCertificates;
import okhttp3.tls.HeldCertificate;
import org.junit.Test;
import static org.junit.Assert.*;

public class ChatHttpGatewayTlsIntegrationTest {
    private static final String ID = "request-id-00000001";

    private static final class DirectExecutor implements Executor {
        @Override public void execute(Runnable command) { command.run(); }
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

    private static final class Callback implements BridgeCore.Callback {
        final AtomicInteger successes = new AtomicInteger();
        final AtomicInteger failures = new AtomicInteger();
        volatile ChatResponse response;
        @Override public void onSuccess(ChatResponse value) {
            response = value;
            successes.incrementAndGet();
        }
        @Override public void onFailure() { failures.incrementAndGet(); }
    }

    private static final class TlsServer implements AutoCloseable {
        final MockWebServer server = new MockWebServer();
        final HeldCertificate certificate;
        final HandshakeCertificates clientTrust;
        TlsServer() throws Exception {
            certificate = new HeldCertificate.Builder()
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
        String endpoint() { return server.url("/v1/chat/completions").toString(); }
        ChatHttpGateway.ConnectionFactory trustedTestFactory() {
            return new ChatHttpGateway.ConnectionFactory() {
                @Override public HttpsURLConnection open(URL url) throws java.io.IOException {
                    HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
                    connection.setSSLSocketFactory(clientTrust.sslSocketFactory());
                    return connection;
                }
            };
        }
        @Override public void close() throws Exception { server.shutdown(); }
    }

    private static ChatRequest request() {
        return new ChatRequest(ID, "conversation-1", "hello Cortana", null);
    }

    private static String response(String text) {
        return "{\"protocolVersion\":1,\"requestId\":\"" + ID
                + "\",\"message\":{\"text\":\"" + text + "\"}}";
    }

    private static ChatHttpGateway gateway(TlsServer server, Executor executor,
                                           int connectTimeout, int readTimeout) {
        return new ChatHttpGateway(server.endpoint(), executor, server.trustedTestFactory(),
                connectTimeout, readTimeout);
    }

    @Test public void realTlsHandshakePostsRequestAndReadsResponse() throws Exception {
        try (TlsServer tls = new TlsServer()) {
            tls.server.enqueue(new MockResponse()
                    .addHeader("Content-Type", "application/json; charset=utf-8")
                    .setBody(response("Hello over real TLS")));
            Callback callback = new Callback();
            gateway(tls, new DirectExecutor(), 2000, 2000).send(request(), callback);

            assertEquals(1, callback.successes.get());
            assertEquals(0, callback.failures.get());
            assertEquals("Hello over real TLS", callback.response.getText());
            RecordedRequest recorded = tls.server.takeRequest(5, TimeUnit.SECONDS);
            assertNotNull(recorded);
            assertEquals("POST", recorded.getMethod());
            assertEquals("/v1/chat/completions", recorded.getPath());
            assertEquals(ID, recorded.getHeader("Idempotency-Key"));
            assertEquals("application/json", recorded.getHeader("Accept"));
            assertTrue(recorded.getBody().readUtf8().contains("\"requestId\":\"" + ID + "\""));
        }
    }

    @Test public void realHttpsRedirectIsNotFollowed() throws Exception {
        try (TlsServer tls = new TlsServer()) {
            tls.server.enqueue(new MockResponse().setResponseCode(302).addHeader("Location", "/redirected"));
            tls.server.enqueue(new MockResponse().setBody(response("must not be reached")));
            Callback callback = new Callback();
            gateway(tls, new DirectExecutor(), 2000, 2000).send(request(), callback);
            assertEquals(0, callback.successes.get());
            assertEquals(1, callback.failures.get());
            assertNotNull(tls.server.takeRequest(5, TimeUnit.SECONDS));
            assertNull("redirect must not be followed", tls.server.takeRequest(250, TimeUnit.MILLISECONDS));
        }
    }

    @Test public void realHttpsHttpErrorIsMappedToGenericFailure() throws Exception {
        try (TlsServer tls = new TlsServer()) {
            tls.server.enqueue(new MockResponse().setResponseCode(503).setBody("private upstream details"));
            Callback callback = new Callback();
            gateway(tls, new DirectExecutor(), 2000, 2000).send(request(), callback);
            assertEquals(0, callback.successes.get());
            assertEquals(1, callback.failures.get());
            assertNotNull(tls.server.takeRequest(5, TimeUnit.SECONDS));
        }
    }

    @Test public void realHttpsReadTimeoutFailsWithoutLeakingServerBody() throws Exception {
        try (TlsServer tls = new TlsServer()) {
            tls.server.enqueue(new MockResponse().setBodyDelay(300, TimeUnit.MILLISECONDS)
                    .setBody(response("late response")));
            Callback callback = new Callback();
            gateway(tls, new DirectExecutor(), 2000, 50).send(request(), callback);
            assertEquals(0, callback.successes.get());
            assertEquals(1, callback.failures.get());
        }
    }

    @Test public void realHttpsOversizedBodyIsRejected() throws Exception {
        try (TlsServer tls = new TlsServer()) {
            tls.server.enqueue(new MockResponse().setBody(repeat("x", 256 * 1024 + 1)));
            Callback callback = new Callback();
            gateway(tls, new DirectExecutor(), 2000, 2000).send(request(), callback);
            assertEquals(0, callback.successes.get());
            assertEquals(1, callback.failures.get());
        }
    }

    @Test public void cancellationDuringRealHttpsReadSuppressesLateCallback() throws Exception {
        try (TlsServer tls = new TlsServer()) {
            tls.server.enqueue(new MockResponse().setBodyDelay(5, TimeUnit.SECONDS)
                    .setBody(response("too late")));
            ThreadExecutor executor = new ThreadExecutor();
            Callback callback = new Callback();
            BridgeCore.Call call = gateway(tls, executor, 3000, 10000).send(request(), callback);
            assertNotNull("request never reached mock HTTPS server",
                    tls.server.takeRequest(5, TimeUnit.SECONDS));
            call.cancel();
            assertTrue("worker did not stop after disconnect", executor.finished.await(5, TimeUnit.SECONDS));
            assertEquals(0, callback.successes.get());
            assertEquals(0, callback.failures.get());
        }
    }

    @Test public void platformDefaultTlsRejectsUntrustedTestCertificate() throws Exception {
        try (TlsServer tls = new TlsServer()) {
            tls.server.enqueue(new MockResponse().setBody(response("should not be trusted")));
            ChatHttpGateway gateway = new ChatHttpGateway(tls.endpoint(), new DirectExecutor(),
                    ChatHttpGateway.defaultConnectionFactory(), 2000, 2000);
            Callback callback = new Callback();
            gateway.send(request(), callback);
            assertEquals(0, callback.successes.get());
            assertEquals(1, callback.failures.get());
        }
    }

    private static String repeat(String value, int count) {
        StringBuilder result = new StringBuilder(count);
        for (int i = 0; i < count; i++) result.append(value);
        return result.toString();
    }
}
