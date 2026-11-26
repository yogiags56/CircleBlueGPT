package com.cortanagpt.probe.bridge;

import android.os.Handler;
import android.os.Looper;

/**
 * Main-looper timeout scheduler. A blocked UI thread can delay timeout delivery;
 * network I/O must never run on this looper.
 */
public final class MainLooperTimeoutScheduler implements BridgeCore.TimeoutScheduler {
    private final Handler handler;

    public MainLooperTimeoutScheduler() {
        this(new Handler(Looper.getMainLooper()));
    }

    MainLooperTimeoutScheduler(Handler handler) {
        if (handler == null) throw new IllegalArgumentException("MISSING_TIMEOUT_HANDLER");
        this.handler = handler;
    }

    @Override public BridgeCore.Cancellable schedule(final Runnable task, long delayMillis) {
        if (task == null) throw new IllegalArgumentException("MISSING_TIMEOUT_TASK");
        if (delayMillis <= 0L) throw new IllegalArgumentException("INVALID_TIMEOUT");
        if (!handler.postDelayed(task, delayMillis)) {
            throw new IllegalStateException("TIMEOUT_SCHEDULE_REJECTED");
        }
        return new BridgeCore.Cancellable() {
            @Override public void cancel() {
                handler.removeCallbacks(task);
            }
        };
    }
}
