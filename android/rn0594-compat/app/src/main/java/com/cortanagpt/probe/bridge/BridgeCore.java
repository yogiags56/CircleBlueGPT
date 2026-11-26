package com.cortanagpt.probe.bridge;

import java.util.HashMap;
import java.util.Map;

/**
 * One-shot text bridge lifecycle. Transport, scheduling and callback delivery are injected.
 * Listener code is never invoked while the internal state lock is held.
 */
public final class BridgeCore {
    public interface Call { void cancel(); }
    public interface Callback {
        void onSuccess(ChatResponse response);
        void onFailure();
    }
    public interface Gateway { Call send(ChatRequest request, Callback callback); }
    public interface Listener {
        void onSuccess(ChatResponse response);
        void onFailure(String errorCode);
        void onCancelled();
    }
    public interface Cancellable { void cancel(); }
    public interface TimeoutScheduler {
        Cancellable schedule(Runnable task, long delayMillis);
    }
    public interface CallbackDispatcher {
        void dispatch(Runnable callback);
    }

    private static final String FAILURE = "GATEWAY_REQUEST_FAILED";
    private static final String TIMEOUT = "REQUEST_TIMEOUT";

    private final Object lock = new Object();
    private final Map<String, State> active = new HashMap<>();
    private final Gateway gateway;
    private final TimeoutScheduler scheduler;
    private final CallbackDispatcher dispatcher;
    private final long timeoutMillis;

    public BridgeCore(Gateway gateway, TimeoutScheduler scheduler,
                      CallbackDispatcher dispatcher, long timeoutMillis) {
        if (gateway == null) throw new IllegalArgumentException("MISSING_GATEWAY");
        if (scheduler == null) throw new IllegalArgumentException("MISSING_TIMEOUT_SCHEDULER");
        if (dispatcher == null) throw new IllegalArgumentException("MISSING_CALLBACK_DISPATCHER");
        if (timeoutMillis <= 0L) throw new IllegalArgumentException("INVALID_TIMEOUT");
        this.gateway = gateway;
        this.scheduler = scheduler;
        this.dispatcher = dispatcher;
        this.timeoutMillis = timeoutMillis;
    }

    /** Rejects duplicate IDs while active. A completed ID may be reused by a new lifecycle. */
    public void submit(final ChatRequest request, Listener listener) {
        if (request == null || listener == null) throw new IllegalArgumentException("INVALID_SUBMISSION");
        final State state = new State(request, listener);
        synchronized (lock) {
            if (active.containsKey(request.getRequestId())) {
                throw new IllegalStateException("REQUEST_ALREADY_ACTIVE");
            }
            active.put(request.getRequestId(), state);
        }

        Cancellable timeoutHandle;
        try {
            timeoutHandle = scheduler.schedule(new Runnable() {
                @Override public void run() { timeout(state); }
            }, timeoutMillis);
            if (timeoutHandle == null) throw new IllegalStateException("MISSING_TIMEOUT_HANDLE");
        } catch (RuntimeException error) {
            finish(state, Outcome.FAILURE, null, false);
            return;
        }

        boolean cancelTimeout;
        synchronized (lock) {
            cancelTimeout = state.terminal;
            if (!cancelTimeout) state.timeoutHandle = timeoutHandle;
        }
        if (cancelTimeout) {
            safeCancel(timeoutHandle);
            return;
        }

        synchronized (lock) {
            if (state.terminal) return;
        }

        Call call;
        try {
            call = gateway.send(request, new Callback() {
                @Override public void onSuccess(ChatResponse response) {
                    if (response == null || !request.getRequestId().equals(response.getRequestId())) {
                        finish(state, Outcome.FAILURE, null, false);
                    } else {
                        finish(state, Outcome.SUCCESS, response, false);
                    }
                }
                @Override public void onFailure() {
                    finish(state, Outcome.FAILURE, null, false);
                }
            });
        } catch (RuntimeException error) {
            finish(state, Outcome.FAILURE, null, false);
            return;
        }

        if (call == null) {
            finish(state, Outcome.FAILURE, null, false);
            return;
        }

        boolean cancelNow;
        synchronized (lock) {
            cancelNow = state.cancelled || state.timedOut;
            if (!state.terminal && !cancelNow) state.call = call;
        }
        if (cancelNow) safeCancel(call);
    }

    /** Returns false when the request is not active or has already reached a terminal state. */
    public boolean cancel(String requestId) {
        if (requestId == null) return false;
        final State state;
        final Call call;
        final Cancellable timeoutHandle;
        synchronized (lock) {
            state = active.get(requestId);
            if (state == null || state.terminal) return false;
            state.terminal = true;
            state.cancelled = true;
            active.remove(requestId);
            call = state.call;
            timeoutHandle = state.timeoutHandle;
        }
        safeCancel(timeoutHandle);
        safeCancel(call);
        dispatchSafely(new Runnable() {
            @Override public void run() { state.listener.onCancelled(); }
        });
        return true;
    }

    public int activeRequestCount() {
        synchronized (lock) { return active.size(); }
    }

    private enum Outcome { SUCCESS, FAILURE, TIMEOUT }

    private void timeout(State state) {
        finish(state, Outcome.TIMEOUT, null, true);
    }

    private void finish(final State state, final Outcome outcome,
                       final ChatResponse response, boolean cancelGateway) {
        final Call call;
        final Cancellable timeoutHandle;
        synchronized (lock) {
            if (state.terminal) return;
            state.terminal = true;
            state.timedOut = outcome == Outcome.TIMEOUT;
            if (active.get(state.request.getRequestId()) == state) {
                active.remove(state.request.getRequestId());
            }
            call = state.call;
            timeoutHandle = state.timeoutHandle;
        }
        safeCancel(timeoutHandle);
        if (cancelGateway) safeCancel(call);
        dispatchSafely(new Runnable() {
            @Override public void run() {
                if (outcome == Outcome.SUCCESS) {
                    state.listener.onSuccess(response);
                } else if (outcome == Outcome.TIMEOUT) {
                    state.listener.onFailure(TIMEOUT);
                } else {
                    state.listener.onFailure(FAILURE);
                }
            }
        });
    }

    private void dispatchSafely(Runnable callback) {
        try {
            dispatcher.dispatch(new Runnable() {
                @Override public void run() {
                    try { callback.run(); } catch (RuntimeException ignored) { }
                }
            });
        } catch (RuntimeException ignored) {
            // Lifecycle state is already terminal; dispatcher failures must not corrupt it.
        }
    }

    private static void safeCancel(Cancellable cancellable) {
        if (cancellable == null) return;
        try { cancellable.cancel(); } catch (RuntimeException ignored) { }
    }

    private static void safeCancel(Call call) {
        if (call == null) return;
        try { call.cancel(); } catch (RuntimeException ignored) { }
    }

    private static final class State {
        final ChatRequest request;
        final Listener listener;
        Call call;
        Cancellable timeoutHandle;
        boolean terminal;
        boolean cancelled;
        boolean timedOut;
        State(ChatRequest request, Listener listener) {
            this.request = request;
            this.listener = listener;
        }
    }
}
