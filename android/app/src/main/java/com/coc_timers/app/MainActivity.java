package com.coc_timers.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OpenGamePlugin.class);
        registerPlugin(NativeClipboardPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
