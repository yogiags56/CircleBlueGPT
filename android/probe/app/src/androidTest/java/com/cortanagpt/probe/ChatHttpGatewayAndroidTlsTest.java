package com.cortanagpt.probe;

import android.os.Looper;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.cortanagpt.probe.bridge.AndroidMainThreadDispatcher;
import com.cortanagpt.probe.bridge.BridgeCore;
import com.cortanagpt.probe.bridge.ChatHttpGateway;
import com.cortanagpt.probe.bridge.ChatRequest;
import com.cortanagpt.probe.bridge.ChatResponse;
import com.cortanagpt.probe.bridge.MainLooperTimeoutScheduler;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.HttpsURLConnection;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import okhttp3.tls.HandshakeCertificates;
import okhttp3.tls.HeldCertificate;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ChatHttpGatewayAndroidTlsTest {
    private static final String ID = "request-id-00000001";

    private static final class TlsFixture implements AutoCloseable {
        final MockWebServer server = new MockWebServer();
        final HeldCertificate certificate;
        final HandshakeCertificates clientTrust;

        TlsFixture() throws Exception {
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

        ChatHttpGateway gateway(ExecutorService executor, int connectTimeout, int readTimeout) {
            return new ChatHttpGateway(server.url("/v1/chat/completions").toString(), executor,
                    new ChatHttpGateway.ConnectionFactory() {
                        @Override public HttpsURLConnection open(URL url) throws java.io.IOException {
                            HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
                            connection.setSSLSocketFactory(clientTrust.sslSocketFactory());
                            return connection;
                        }
                    }, connectTimeout, readTimeout);
        }

        @Override public void close() throws Exception { server.shutdown(); }
    }

    private static final class RecordingListener implements BridgeCore.Listener {
        final CountDownLatch terminal = new CountDownLatch(1);
        final AtomicInteger successes = new AtomicInteger();
        final AtomicInteger failures = new AtomicInteger();
        final AtomicInteger cancellations = new AtomicInteger();
        final AtomicBoolean callbackOnMain = new AtomicBoolean(false);
        volatile ChatResponse response;
        private void record() {
            callbackOnMain.set(Looper.myLooper() == Looper.getMainLooper());
            terminal.countDown();
        }
        @Override public void onSuccess(ChatResponse value) {
            response = value;
            successes.incrementAndGet();
            record();
        }
        @Override public void onFailure(String errorCode) {
            failures.incrementAndGet();
            record();
        }
        @Override public void onCancelled() {
            cancellations.incrementAndGet();
            record();
        }
    }

    private static ChatRequest request() {
        return new ChatRequest(ID, "android-instrumentation", "Hello Cortana", null);
    }

    private static String response(String text) {
        return "{\"protocolVersion\":1,\"requestId\":\"" + ID
                + "\",\"message\":{\"text\":\"" + text + "\"}}";
    }

    @Test public void androidHttpsRoundTripDispatchesCortanaReplyToMainLooper() throws Exception {
        try (TlsFixture tls = new TlsFixture()) {
            tls.server.enqueue(new MockResponse()
                    .addHeader("Content-Type", "application/json; charset=utf-8")
                    .setBody(response("Hello from Android TLS")));
            ExecutorService worker = Executors.newSingleThreadExecutor();
            try {
                BridgeCore core = new BridgeCore(tls.gateway(worker, 3000, 3000),
                        new MainLooperTimeoutScheduler(), new AndroidMainThreadDispatcher(), 8000L);
                RecordingListener listener = new RecordingListener();
                core.submit(request(), listener);
                assertTrue("bridge response not delivered", listener.terminal.await(8, TimeUnit.SECONDS));
                assertEquals(1, listener.successes.get());
                assertEquals(0, listener.failures.get());
                assertEquals("Hello from Android TLS", listener.response.getText());
                assertTrue("listener must run on main looper", listener.callbackOnMain.get());

                RecordedRequest recorded = tls.server.takeRequest(5, TimeUnit.SECONDS);
                assertNotNull(recorded);
                assertEquals("POST", recorded.getMethod());
                assertEquals("/v1/chat/completions", recorded.getPath());
                assertEquals(ID, recorded.getHeader("Idempotency-Key"));
                assertTrue(recorded.getBody().readUtf8().contains("\"requestId\":\"" + ID + "\""));
                assertEquals(0, core.activeRequestCount());
            } finally {
                worker.shutdownNow();
                worker.awaitTermination(5, TimeUnit.SECONDS);
            }
        }
    }

    @Test public void androidHttpsRedirectIsRejectedWithoutFollowingLocation() throws Exception {
        try (TlsFixture tls = new TlsFixture()) {
            tls.server.enqueue(new MockResponse().setResponseCode(302).addHeader("Location", "/redirected"));
            tls.server.enqueue(new MockResponse().setBody(response("must not be reached")));
            ExecutorService worker = Executors.newSingleThreadExecutor();
            try {
                final CountDownLatch failed = new CountDownLatch(1);
                final AtomicInteger success = new AtomicInteger();
                final AtomicInteger failure = new AtomicInteger();
                tls.gateway(worker, 3000, 3000).send(request(), new BridgeCore.Callback() {
                    @Override public void onSuccess(ChatResponse value) { success.incrementAndGet(); failed.countDown(); }
                    @Override public void onFailure() { failure.incrementAndGet(); failed.countDown(); }
                });
                assertTrue("HTTP callback not delivered", failed.await(5, TimeUnit.SECONDS));
                assertEquals(0, success.get());
                assertEquals(1, failure.get());
                assertNotNull(tls.server.takeRequest(5, TimeUnit.SECONDS));
                assertNull("Android client followed redirect", tls.server.takeRequest(250, TimeUnit.MILLISECONDS));
            } finally {
                worker.shutdownNow();
                worker.awaitTermination(5, TimeUnit.SECONDS);
            }
        }
    }

    @Test public void androidHttpsCancellationDuringReadProducesOnlyCancelledTerminalEvent() throws Exception {
        try (TlsFixture tls = new TlsFixture()) {
            tls.server.enqueue(new MockResponse().setBodyDelay(5, TimeUnit.SECONDS)
                    .setBody(response("too late")));
            ExecutorService worker = Executors.newSingleThreadExecutor();
            try {
                BridgeCore core = new BridgeCore(tls.gateway(worker, 3000, 10000),
                        new MainLooperTimeoutScheduler(), new AndroidMainThreadDispatcher(), 12000L);
                RecordingListener listener = new RecordingListener();
                core.submit(request(), listener);
                assertNotNull("request did not reach local HTTPS server",
                        tls.server.takeRequest(5, TimeUnit.SECONDS));
                assertTrue("active request was not cancelled", core.cancel(ID));
                assertTrue("cancel callback not delivered", listener.terminal.await(5, TimeUnit.SECONDS));
                assertEquals(0, listener.successes.get());
                assertEquals(0, listener.failures.get());
                assertEquals(1, listener.cancellations.get());
                assertTrue("cancel callback must run on main looper", listener.callbackOnMain.get());
                assertEquals(0, core.activeRequestCount());
            } finally {
                worker.shutdownNow();
                worker.awaitTermination(5, TimeUnit.SECONDS);
            }
        }
    }
}
