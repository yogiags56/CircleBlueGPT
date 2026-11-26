package com.cortanagpt.rn0594compat;

import com.cortanagpt.probe.bridge.AndroidBridgeRuntime;
import com.cortanagpt.probe.bridge.AndroidEnrollmentKeyProvider;
import com.cortanagpt.probe.bridge.LegacyConversationAdapter;
import android.net.Uri;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * RN 0.59.4 facade over the platform-neutral Cortana text bridge.
 * The endpoint is supplied by an Android resource overlay; no endpoint or credential is hardcoded.
 */
public final class CortanaBridgeModule extends ReactContextBaseJavaModule {
    static final String EVENT_MESSAGE = "CortanaAssistantMessage";
    static final String EVENT_ERROR = "CortanaBridgeError";
    static final String EVENT_CANCELLED = "CortanaBridgeCancelled";

    private final Object lock = new Object();
    private AndroidBridgeRuntime runtime;
    private String endpointUrl;

    public CortanaBridgeModule(ReactApplicationContext context) {
        super(context);
        String configured = context.getString(R.string.cortanagpt_chat_endpoint);
        endpointUrl = configured == null ? "" : configured.trim();
    }

    @Override public String getName() { return "CortanaBridge"; }

    /** Returns only the installation's public P-256 identity; private key never leaves Keystore. */
    @ReactMethod public void getEnrollmentPublicKey(Promise promise) {
        try {
            AndroidEnrollmentKeyProvider.PublicIdentity identity =
                    new AndroidEnrollmentKeyProvider().getOrCreatePublicIdentity();
            WritableMap result = Arguments.createMap();
            result.putString("kty", "EC");
            result.putString("crv", "P-256");
            result.putString("x", identity.x);
            result.putString("y", identity.y);
            result.putString("thumbprint", identity.thumbprint);
            promise.resolve(result);
        } catch (Exception error) {
            promise.reject("E_ENROLLMENT_KEY", safeMessage(error));
        }
    }

    /** Signs a backend challenge without exporting the Android Keystore private key. */
    @ReactMethod public void signEnrollmentChallenge(String challengeId, String nonce, Promise promise) {
        try {
            String signature = new AndroidEnrollmentKeyProvider()
                    .signEnrollmentChallenge(challengeId, nonce);
            promise.resolve(signature);
        } catch (Exception error) {
            promise.reject("E_ENROLLMENT_PROOF", safeMessage(error));
        }
    }
    @ReactMethod public void getBridgeStatus(Promise promise) {
        promise.resolve(isEndpointConfigured() ? "endpoint-configured" : "endpoint-not-configured");
    }

    @ReactMethod public void setConversationId(String conversationId, Promise promise) {
        try {
            AndroidBridgeRuntime bridge = requireRuntime();
            bridge.setConversationId(conversationId);
            promise.resolve(null);
        } catch (Exception error) {
            promise.reject("E_BRIDGE_CONFIGURATION", safeMessage(error));
        }
    }

    /** Text-only entry point. The legacy sendQuery(text, boolean) flag is deliberately not guessed. */
    @ReactMethod public void sendText(String text, Promise promise) {
        if (text == null || text.trim().length() == 0 || text.length() > 16384) {
            promise.reject("E_INVALID_INPUT", "Text must contain 1–16384 characters.");
            return;
        }
        try {
            AndroidBridgeRuntime bridge = requireRuntime();
            String requestId = bridge.sendQuery(text, new LegacyConversationAdapter.Listener() {
                @Override public void onAssistantMessage(LegacyConversationAdapter.LegacyMessage message) {
                    WritableMap payload = Arguments.createMap();
                    payload.putString("text", message.view.displayText);
                    emit(EVENT_MESSAGE, payload);
                }
                @Override public void onError(String errorCode) {
                    WritableMap payload = Arguments.createMap();
                    payload.putString("code", errorCode);
                    emit(EVENT_ERROR, payload);
                }
                @Override public void onCancelled() {
                    emit(EVENT_CANCELLED, Arguments.createMap());
                }
            });
            if (requestId == null) {
                promise.reject("E_SUBMISSION_FAILED", "The text request was not accepted.");
            } else {
                promise.resolve(requestId);
            }
        } catch (Exception error) {
            promise.reject("E_BRIDGE_UNAVAILABLE", safeMessage(error));
        }
    }

    @ReactMethod public void cancelListening(Promise promise) {
        synchronized (lock) {
            promise.resolve(runtime != null && runtime.cancelListening());
        }
    }

    @ReactMethod public void resetConversation(Promise promise) {
        synchronized (lock) {
            if (runtime != null) runtime.resetConversation();
            promise.resolve(null);
        }
    }

    /** Mirrors the original no-argument focus notification; it does not submit text. */
    @ReactMethod public void onUserManualInput() {
        synchronized (lock) {
            if (runtime != null) runtime.onUserManualInput();
        }
    }

    @ReactMethod public void addListener(String eventName) { }
    @ReactMethod public void removeListeners(Integer count) { }

    @Override public void onCatalystInstanceDestroy() {
        synchronized (lock) {
            if (runtime != null) {
                runtime.close();
                runtime = null;
            }
        }
        super.onCatalystInstanceDestroy();
    }

    private boolean isEndpointConfigured() {
        synchronized (lock) {
            if (endpointUrl.length() == 0) return false;
            try {
                Uri uri = Uri.parse(endpointUrl);
                return "https".equalsIgnoreCase(uri.getScheme())
                        && uri.getHost() != null
                        && uri.getHost().length() > 0
                        && uri.getUserInfo() == null
                        && uri.getQuery() == null
                        && uri.getFragment() == null;
            } catch (RuntimeException error) {
                return false;
            }
        }
    }

    private AndroidBridgeRuntime requireRuntime() {
        synchronized (lock) {
            if (!isEndpointConfigured()) {
                throw new IllegalStateException("CHAT_ENDPOINT_NOT_CONFIGURED_OR_INVALID");
            }
            if (runtime == null || runtime.isClosed()) {
                runtime = new AndroidBridgeRuntime(endpointUrl, null);
            }
            return runtime;
        }
    }

    private void emit(String eventName, WritableMap payload) {
        if (!getReactApplicationContext().hasActiveCatalystInstance()) return;
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, payload);
    }

    private static String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.length() == 0 ? "BRIDGE_ERROR" : message;
    }
}
