package com.cortanagpt.probe.bridge;

import android.os.Handler;
import android.os.Looper;

/** Delivers bridge listener callbacks on Android's main/UI thread. */
public final class AndroidMainThreadDispatcher implements BridgeCore.CallbackDispatcher {
    private final Handler handler;

    public AndroidMainThreadDispatcher() {
        this(new Handler(Looper.getMainLooper()));
    }

    AndroidMainThreadDispatcher(Handler handler) {
        if (handler == null) throw new IllegalArgumentException("MISSING_MAIN_HANDLER");
        this.handler = handler;
    }

    @Override public void dispatch(Runnable callback) {
        if (callback == null) throw new IllegalArgumentException("MISSING_CALLBACK");
        if (!handler.post(callback)) throw new IllegalStateException("MAIN_THREAD_DISPATCH_REJECTED");
    }
}
