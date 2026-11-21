package com.cortanagpt.probe.bridge;

import java.util.HashMap;
import java.util.Map;

/**
 * One-shot text bridge lifecycle. It deliberately contains no HTTP/authentication code;
 * a reviewed gateway implementation is injected later.
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

    private final Object lock = new Object();
    private final Map<String, State> active = new HashMap<>();
    private final Gateway gateway;

    public BridgeCore(Gateway gateway) {
        if (gateway == null) throw new IllegalArgumentException("MISSING_GATEWAY");
        this.gateway = gateway;
    }

    /** Rejects duplicate IDs while active. A completed ID may be reused by a new lifecycle. */
    public void submit(final ChatRequest request, Listener listener) {
        if (request == null || listener == null) throw new IllegalArgumentException("INVALID_SUBMISSION");
        final State state = new State(request, listener);
        synchronized (lock) {
            if (active.containsKey(request.getRequestId())) throw new IllegalStateException("REQUEST_ALREADY_ACTIVE");
            active.put(request.getRequestId(), state);
        }

        Call call;
        try {
            call = gateway.send(request, new Callback() {
                @Override public void onSuccess(ChatResponse response) {
                    if (response == null || !request.getRequestId().equals(response.getRequestId())) {
                        finish(state, Outcome.FAILURE, null);
                    } else {
                        finish(state, Outcome.SUCCESS, response);
                    }
                }
                @Override public void onFailure() {
                    finish(state, Outcome.FAILURE, null);
                }
            });
            if (call == null) {
                finish(state, Outcome.FAILURE, null);
                return;
            }
        } catch (RuntimeException error) {
            finish(state, Outcome.FAILURE, null);
            return;
        }

        boolean cancelNow;
        synchronized (lock) {
            cancelNow = state.cancelled;
            if (!state.terminal && !cancelNow) state.call = call;
        }
        if (cancelNow) safeCancel(call);
    }

    /** Returns false when the request is not active or has already reached a terminal state. */
    public boolean cancel(String requestId) {
        final State state;
        final Call call;
        synchronized (lock) {
            state = active.get(requestId);
            if (state == null || state.terminal) return false;
            state.terminal = true;
            state.cancelled = true;
            active.remove(requestId);
            call = state.call;
        }
        if (call != null) safeCancel(call);
        state.listener.onCancelled();
        return true;
    }

    public int activeRequestCount() {
        synchronized (lock) { return active.size(); }
    }

    private enum Outcome { SUCCESS, FAILURE }

    private void finish(State state, Outcome outcome, ChatResponse response) {
        synchronized (lock) {
            if (state.terminal) return;
            state.terminal = true;
            active.remove(state.request.getRequestId(), state);
        }
        if (outcome == Outcome.SUCCESS) state.listener.onSuccess(response);
        else state.listener.onFailure("GATEWAY_REQUEST_FAILED");
    }

    private static void safeCancel(Call call) {
        try { call.cancel(); } catch (RuntimeException ignored) { }
    }

    private static final class State {
        final ChatRequest request;
        final Listener listener;
        Call call;
        boolean terminal;
        boolean cancelled;
        State(ChatRequest request, Listener listener) {
            this.request = request;
            this.listener = listener;
        }
    }
}
