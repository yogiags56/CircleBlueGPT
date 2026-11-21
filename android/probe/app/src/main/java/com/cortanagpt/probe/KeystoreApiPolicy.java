package com.cortanagpt.probe;

/** Pure compatibility policy so legacy API gating can be tested on the host JVM. */
final class KeystoreApiPolicy {
    private KeystoreApiPolicy() {}

    static void requireSupported(int sdkInt) {
        if (sdkInt < 23) throw new UnsupportedOperationException(
                "ANDROID_KEYSTORE_AES_GCM_REQUIRES_API_23; persistent local memory is disabled on API 19-22");
    }
}
