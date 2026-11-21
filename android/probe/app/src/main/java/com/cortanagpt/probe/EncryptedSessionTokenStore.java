package com.cortanagpt.probe;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import java.nio.charset.Charset;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Stores only AES-GCM ciphertext in private app preferences; no plaintext token persistence. */
public final class EncryptedSessionTokenStore {
    private static final String PREFS = "cortanagpt_secure_session";
    private static final String VALUE = "token_ciphertext";
    private static final String NONCE = "token_nonce";
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private final Context context;
    private final AndroidKeystoreKeyProvider keys;

    public EncryptedSessionTokenStore(Context context, AndroidKeystoreKeyProvider keys) {
        this.context = context.getApplicationContext(); this.keys = keys;
    }
    public void save(String token) throws Exception {
        if (token == null || token.length() == 0) throw new IllegalArgumentException("EMPTY_TOKEN");
        SecretKey key = keys.getOrCreate();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] encrypted = cipher.doFinal(token.getBytes(UTF8));
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean saved = p.edit().putString(VALUE, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(NONCE, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).commit();
        if (!saved) throw new IllegalStateException("TOKEN_STORAGE_FAILED");
    }
    public String read() throws Exception {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String value = p.getString(VALUE, null), nonce = p.getString(NONCE, null);
        if (value == null || nonce == null) return null;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, keys.getOrCreate(), new GCMParameterSpec(128, Base64.decode(nonce, Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(value, Base64.NO_WRAP)), UTF8);
    }
    public void clear() {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    /** Irreversibly removes the session ciphertext and its Keystore key. */
    public void destroy() throws Exception {
        keys.delete();
        boolean cleared = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().clear().commit();
        if (!cleared) throw new IllegalStateException("TOKEN_STORAGE_DESTROY_FAILED");
    }
}
