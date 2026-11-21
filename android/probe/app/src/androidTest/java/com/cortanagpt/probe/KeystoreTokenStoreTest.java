package com.cortanagpt.probe;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class KeystoreTokenStoreTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final AndroidKeystoreKeyProvider keys = new AndroidKeystoreKeyProvider();
    private final EncryptedSessionTokenStore store = new EncryptedSessionTokenStore(context, keys);

    @After public void cleanup() throws Exception { store.clear(); if (android.os.Build.VERSION.SDK_INT >= 23) keys.delete(); }

    @Test public void tokenRoundTripsWithoutPlaintextPreference() throws Exception {
        if (android.os.Build.VERSION.SDK_INT < 23) return;
        String token = "ephemeral-test-session-secret";
        store.save(token);
        assertEquals(token, store.read());
        String raw = context.getSharedPreferences("cortanagpt_secure_session", Context.MODE_PRIVATE)
                .getString("token_ciphertext", "");
        assertFalse("ciphertext must not contain plaintext", raw.contains(token));
    }

    @Test public void deletingKeystoreKeyMakesOldCiphertextUnreadable() throws Exception {
        if (android.os.Build.VERSION.SDK_INT < 23) return;
        store.save("rotate-me");
        keys.delete();
        try { store.read(); fail("old ciphertext must not decrypt after key deletion"); }
        catch (Exception expected) { /* key recreation yields a different key */ }
    }

    @Test public void api19To22ExplicitlyDisablePersistentKeystoreAes() throws Exception {
        if (android.os.Build.VERSION.SDK_INT >= 23) return;
        try { keys.getOrCreate(); fail("API 19-22 must not silently use a weaker fallback"); }
        catch (UnsupportedOperationException expected) { assertTrue(expected.getMessage().contains("API_23")); }
    }
}
