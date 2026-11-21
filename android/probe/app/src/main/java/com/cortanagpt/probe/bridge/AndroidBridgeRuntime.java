package com.cortanagpt.probe.bridge;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Android composition root for the text-only Cortana bridge.
 * Owns its worker executor and closes active work before shutting the executor down.
 */
public final class AndroidBridgeRuntime implements AutoCloseable {
    private static final long DEFAULT_REQUEST_TIMEOUT_MS = 45000L;

    private final Object lifecycleLock = new Object();
    private final ExecutorService worker;
    private final AndroidMainThreadDispatcher mainDispatcher;
    private final LegacyConversationAdapter conversationAdapter;
    private final AtomicBoolean closed = new AtomicBoolean(false);

    public AndroidBridgeRuntime(String endpointUrl,
                                LegacyConversationAdapter.SelectedMemoryProvider memoryProvider) {
        this(endpointUrl, memoryProvider, DEFAULT_REQUEST_TIMEOUT_MS,
                ChatHttpGateway.DEFAULT_CONNECT_TIMEOUT_MS,
                ChatHttpGateway.DEFAULT_READ_TIMEOUT_MS,
                ChatHttpGateway.defaultConnectionFactory());
    }

    /** Allows a test-only HTTPS connection factory; production should use the default constructor. */
    public AndroidBridgeRuntime(String endpointUrl,
                                LegacyConversationAdapter.SelectedMemoryProvider memoryProvider,
                                long requestTimeoutMillis,
                                ChatHttpGateway.ConnectionFactory connectionFactory) {
        this(endpointUrl, memoryProvider, requestTimeoutMillis,
                ChatHttpGateway.DEFAULT_CONNECT_TIMEOUT_MS,
                ChatHttpGateway.DEFAULT_READ_TIMEOUT_MS, connectionFactory);
    }

    private AndroidBridgeRuntime(String endpointUrl,
                                 LegacyConversationAdapter.SelectedMemoryProvider memoryProvider,
                                 long requestTimeoutMillis,
                                 int connectTimeoutMillis,
                                 int readTimeoutMillis,
                                 ChatHttpGateway.ConnectionFactory connectionFactory) {
        if (requestTimeoutMillis <= 0L || requestTimeoutMillis > 120000L) {
            throw new IllegalArgumentException("INVALID_REQUEST_TIMEOUT");
        }
        if (connectionFactory == null) throw new IllegalArgumentException("MISSING_CONNECTION_FACTORY");

        this.worker = Executors.newSingleThreadExecutor(new BridgeThreadFactory());
        this.mainDispatcher = new AndroidMainThreadDispatcher();
        ChatHttpGateway gateway = new ChatHttpGateway(endpointUrl, worker, connectionFactory,
                connectTimeoutMillis, readTimeoutMillis);
        BridgeCore core = new BridgeCore(gateway, new MainLooperTimeoutScheduler(),
                mainDispatcher, requestTimeoutMillis);
        this.conversationAdapter = new LegacyConversationAdapter(core, memoryProvider);
    }

    public void setConversationId(String conversationId) {
        synchronized (lifecycleLock) {
            requireOpen();
            conversationAdapter.setConversationId(conversationId);
        }
    }

    public String getConversationId() {
        return conversationAdapter.getConversationId();
    }

    public String getActiveRequestId() {
        return conversationAdapter.getActiveRequestId();
    }

    public String sendQuery(String text, LegacyConversationAdapter.Listener listener) {
        if (listener == null) throw new IllegalArgumentException("MISSING_LISTENER");
        synchronized (lifecycleLock) {
            if (closed.get()) {
                dispatchError(listener, "BRIDGE_CLOSED");
                return null;
            }
            return conversationAdapter.sendQuery(text, onMainThread(listener));
        }
    }

    /** Mirrors NewmanViewModule's no-argument text-input focus notification. */
    public void onUserManualInput() {
        synchronized (lifecycleLock) {
            if (closed.get()) return;
            conversationAdapter.onUserManualInput();
        }
    }

    public boolean cancelListening() {
        synchronized (lifecycleLock) {
            if (closed.get()) return false;
            return conversationAdapter.cancelListening();
        }
    }

    public void resetConversation() {
        synchronized (lifecycleLock) {
            if (closed.get()) return;
            conversationAdapter.resetConversation();
        }
    }

    public void forceResetConnection() {
        resetConversation();
    }

    public boolean startListening(LegacyConversationAdapter.Listener listener) {
        if (listener == null) throw new IllegalArgumentException("MISSING_LISTENER");
        synchronized (lifecycleLock) {
            if (closed.get()) {
                dispatchError(listener, "BRIDGE_CLOSED");
                return false;
            }
            return conversationAdapter.startListening(onMainThread(listener));
        }
    }

    public boolean onAdaptiveCardSubmit(LegacyConversationAdapter.Listener listener) {
        if (listener == null) throw new IllegalArgumentException("MISSING_LISTENER");
        synchronized (lifecycleLock) {
            if (closed.get()) {
                dispatchError(listener, "BRIDGE_CLOSED");
                return false;
            }
            return conversationAdapter.onAdaptiveCardSubmit(onMainThread(listener));
        }
    }

    public boolean sendSkillEvent(LegacyConversationAdapter.Listener listener) {
        if (listener == null) throw new IllegalArgumentException("MISSING_LISTENER");
        synchronized (lifecycleLock) {
            if (closed.get()) {
                dispatchError(listener, "BRIDGE_CLOSED");
                return false;
            }
            return conversationAdapter.sendSkillEvent(onMainThread(listener));
        }
    }

    public boolean isClosed() { return closed.get(); }

    /** Idempotent, non-blocking close. Active request cancellation precedes executor shutdown. */
    @Override public void close() {
        synchronized (lifecycleLock) {
            if (!closed.compareAndSet(false, true)) return;
            conversationAdapter.resetConversation();
            worker.shutdownNow();
        }
    }

    private void requireOpen() {
        if (closed.get()) throw new IllegalStateException("BRIDGE_CLOSED");
    }

    private LegacyConversationAdapter.Listener onMainThread(final LegacyConversationAdapter.Listener listener) {
        return new LegacyConversationAdapter.Listener() {
            @Override public void onAssistantMessage(final LegacyConversationAdapter.LegacyMessage message) {
                dispatch(new Runnable() {
                    @Override public void run() { listener.onAssistantMessage(message); }
                });
            }
            @Override public void onError(final String errorCode) {
                dispatch(new Runnable() {
                    @Override public void run() { listener.onError(errorCode); }
                });
            }
            @Override public void onCancelled() {
                dispatch(new Runnable() {
                    @Override public void run() { listener.onCancelled(); }
                });
            }
        };
    }

    private void dispatchError(LegacyConversationAdapter.Listener listener, String errorCode) {
        onMainThread(listener).onError(errorCode);
    }

    private void dispatch(final Runnable callback) {
        try {
            mainDispatcher.dispatch(new Runnable() {
                @Override public void run() {
                    try { callback.run(); } catch (RuntimeException ignored) { }
                }
            });
        } catch (RuntimeException ignored) { }
    }

    private static final class BridgeThreadFactory implements ThreadFactory {
        private final AtomicInteger sequence = new AtomicInteger();
        @Override public Thread newThread(Runnable task) {
            Thread thread = new Thread(task, "cortanagpt-https-" + sequence.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        }
    }
}
