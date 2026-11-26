package com.cortanagpt.probe;

import org.junit.Test;
import static org.junit.Assert.*;

public class KeystoreApiPolicyTest {
    @Test public void rejectsApi19() {
        assertRejected(19);
    }

    @Test public void rejectsApi22() {
        assertRejected(22);
    }

    @Test public void acceptsApi23Boundary() {
        KeystoreApiPolicy.requireSupported(23);
    }

    @Test public void acceptsModernApi() {
        KeystoreApiPolicy.requireSupported(35);
    }

    private static void assertRejected(int sdkInt) {
        try {
            KeystoreApiPolicy.requireSupported(sdkInt);
            fail("API " + sdkInt + " must not enable persistent Keystore AES-GCM");
        } catch (UnsupportedOperationException expected) {
            assertTrue(expected.getMessage().contains("API_23"));
        }
    }
}
