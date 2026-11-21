package com.cortanagpt.probe;

import android.os.Looper;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.cortanagpt.probe.bridge.AndroidMainThreadDispatcher;
import com.cortanagpt.probe.bridge.BridgeCore;
import com.cortanagpt.probe.bridge.MainLooperTimeoutScheduler;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class BridgeAndroidAdaptersTest {
    @Test public void callbackDispatcherRunsOnMainLooper() throws Exception {
        final CountDownLatch delivered = new CountDownLatch(1);
        final AtomicBoolean onMainThread = new AtomicBoolean(false);
        new AndroidMainThreadDispatcher().dispatch(new Runnable() {
            @Override public void run() {
                onMainThread.set(Looper.myLooper() == Looper.getMainLooper());
                delivered.countDown();
            }
        });
        assertTrue("main-thread callback was not delivered", delivered.await(5, TimeUnit.SECONDS));
        assertTrue("callback must run on Android main looper", onMainThread.get());
    }

    @Test public void timeoutSchedulerRunsTaskOnMainLooper() throws Exception {
        final CountDownLatch fired = new CountDownLatch(1);
        final AtomicBoolean onMainThread = new AtomicBoolean(false);
        BridgeCore.Cancellable handle = new MainLooperTimeoutScheduler().schedule(new Runnable() {
            @Override public void run() {
                onMainThread.set(Looper.myLooper() == Looper.getMainLooper());
                fired.countDown();
            }
        }, 25L);
        assertTrue("timeout task was not delivered", fired.await(5, TimeUnit.SECONDS));
        assertTrue("timeout must run on Android main looper", onMainThread.get());
        handle.cancel();
    }
}
