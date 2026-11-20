package com.prismburst.brickodyssey;

import android.graphics.Color;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before BridgeActivity.onCreate so the plugin is in the bridge.
        registerPlugin(OpenUrlPlugin.class);
        super.onCreate(savedInstanceState);
        // Android 15 draws edge-to-edge. EdgeToEdge sets that up without the
        // deprecated status-bar and navigation-bar color APIs. Capacitor SystemBars
        // then reports the insets, and the page keeps the canvas inside them.
        int scrim = Color.parseColor("#070a1f");
        EdgeToEdge.enable(this, SystemBarStyle.dark(scrim), SystemBarStyle.dark(scrim));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
