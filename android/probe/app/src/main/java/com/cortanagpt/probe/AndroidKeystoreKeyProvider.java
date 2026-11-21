package com.cortanagpt.probe;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.security.KeyStore;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** AES-256 key in Android Keystore. Persistent encryption intentionally requires API 23+. */
public final class AndroidKeystoreKeyProvider {
    public static final String ALIAS = "cortanagpt.local-memory.v1";

    public SecretKey getOrCreate() throws Exception {
        requireSupportedApi();
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        java.security.Key existing = store.getKey(ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    public void delete() throws Exception {
        requireSupportedApi();
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) store.deleteEntry(ALIAS);
    }

    private static void requireSupportedApi() {
        if (Build.VERSION.SDK_INT < 23) throw new UnsupportedOperationException(
                "ANDROID_KEYSTORE_AES_GCM_REQUIRES_API_23; persistent local memory is disabled on API 19-22");
    }
}
