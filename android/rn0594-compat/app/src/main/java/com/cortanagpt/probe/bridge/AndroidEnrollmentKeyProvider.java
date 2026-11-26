package com.cortanagpt.probe.bridge;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Locale;

/**
 * Per-installation P-256 signing identity backed by Android Keystore.
 * Private key material is non-exportable. API < 23 fails closed.
 */
public final class AndroidEnrollmentKeyProvider {
    public static final String ALIAS = "cortanagpt.enrollment.p256.v1";

    public static final class PublicIdentity {
        public final String x;
        public final String y;
        public final String thumbprint;

        PublicIdentity(String x, String y, String thumbprint) {
            this.x = x;
            this.y = y;
            this.thumbprint = thumbprint;
        }
    }

    public PublicIdentity getOrCreatePublicIdentity() throws Exception {
        KeyPair pair = getOrCreateKeyPair();
        ECPublicKey publicKey = (ECPublicKey) pair.getPublic();
        String x = base64Url(unsigned32(publicKey.getW().getAffineX()));
        String y = base64Url(unsigned32(publicKey.getW().getAffineY()));
        String canonical = "{\"crv\":\"P-256\",\"kty\":\"EC\",\"x\":\"" + x + "\",\"y\":\"" + y + "\"}";
        String thumbprint = base64Url(MessageDigest.getInstance("SHA-256")
                .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        return new PublicIdentity(x, y, thumbprint);
    }

    /** Signs the exact versioned enrollment payload expected by the backend. */
    public String signEnrollmentChallenge(String challengeId, String nonce) throws Exception {
        if (challengeId == null || !challengeId.matches("[A-Za-z0-9_-]{32}")
                || nonce == null || !nonce.matches("[A-Za-z0-9_-]{43}")) {
            throw new IllegalArgumentException("INVALID_ENROLLMENT_CHALLENGE");
        }
        PublicIdentity identity = getOrCreatePublicIdentity();
        String canonical = "CORTANAGPT-ENROLL-V1\nPOST\n/v1/enroll\n"
                + challengeId + "\n" + nonce + "\n" + identity.thumbprint;
        KeyPair pair = getOrCreateKeyPair();
        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(pair.getPrivate());
        signer.update(canonical.getBytes(StandardCharsets.UTF_8));
        return base64Url(signer.sign());
    }

    public void delete() throws Exception {
        requireSupportedApi();
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) store.deleteEntry(ALIAS);
    }

    private KeyPair getOrCreateKeyPair() throws Exception {
        requireSupportedApi();
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) {
            java.security.Key privateKey = store.getKey(ALIAS, null);
            java.security.cert.Certificate certificate = store.getCertificate(ALIAS);
            if (privateKey instanceof PrivateKey && certificate != null) {
                return new KeyPair(certificate.getPublicKey(), (PrivateKey) privateKey);
            }
            store.deleteEntry(ALIAS);
        }

        KeyPairGenerator generator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
        generator.initialize(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build());
        return generator.generateKeyPair();
    }

    private static byte[] unsigned32(BigInteger value) {
        byte[] encoded = value.toByteArray();
        int offset = encoded.length == 33 && encoded[0] == 0 ? 1 : 0;
        int length = encoded.length - offset;
        if (length > 32) throw new IllegalArgumentException("INVALID_P256_COORDINATE");
        byte[] result = new byte[32];
        System.arraycopy(encoded, offset, result, 32 - length, length);
        return result;
    }

    private static String base64Url(byte[] value) {
        return Base64.encodeToString(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static void requireSupportedApi() {
        if (Build.VERSION.SDK_INT < 23) {
            throw new IllegalStateException("ENROLLMENT_KEYSTORE_REQUIRES_API_23");
        }
    }
}
