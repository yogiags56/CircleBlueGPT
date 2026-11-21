package com.cortanagpt.probe;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.widget.TextView;

public final class ProbeActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView view = new TextView(this);
        view.setPadding(32, 32, 32, 32);
        view.setText("CortanaGPT Android Probe\nAPI " + Build.VERSION.SDK_INT +
                "\nAndroid Keystore AES-GCM: " + (Build.VERSION.SDK_INT >= 23 ? "available for test" : "not supported; memory persistence disabled"));
        setContentView(view);
    }
}
