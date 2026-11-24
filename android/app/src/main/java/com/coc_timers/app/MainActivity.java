package com.coc_timers.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private static final long SPLASH_TIMEOUT_MS = 2500;
    private boolean webReady = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !webReady);

        registerPlugin(OpenGamePlugin.class);
        registerPlugin(NativeClipboardPlugin.class);
        super.onCreate(savedInstanceState);

        getWindow().setBackgroundDrawableResource(R.drawable.splash);

        if (getBridge() != null) {
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    view.post(() -> webReady = true);
                }

                @Override
                public void onPageLoaded(WebView webView) {
                    webView.post(() -> webReady = true);
                }
            });
        }

        new Handler(Looper.getMainLooper()).postDelayed(() -> webReady = true, SPLASH_TIMEOUT_MS);
    }
}
