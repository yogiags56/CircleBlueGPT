package com.cortanagpt.rn0594compat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

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
}
