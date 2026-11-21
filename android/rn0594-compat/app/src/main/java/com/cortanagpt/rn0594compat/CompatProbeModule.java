package com.cortanagpt.rn0594compat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public final class CompatProbeModule extends ReactContextBaseJavaModule {
    public CompatProbeModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "RN0594Probe";
    }

    @ReactMethod
    public void ping(Promise promise) {
        promise.resolve("native-module-ready");
    }

    @ReactMethod
    public void fail(Promise promise) {
        promise.reject("E_PROBE", "native-module-rejected");
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Required by NativeEventEmitter on this legacy bridge.
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        // This probe has no long-lived native event subscriptions to release.
    }

    @ReactMethod
    public void emitProbeEvent() {
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("rn0594Probe", "event-ready");
    }
}
