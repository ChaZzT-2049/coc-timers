package com.coc_timers.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OpenGame")
public class OpenGamePlugin extends Plugin {
    private static final String COC_PACKAGE = "com.supercell.clashofclans";
    private static final String PLAY_MARKET = "market://details?id=" + COC_PACKAGE;
    private static final String PLAY_WEB = "https://play.google.com/store/apps/details?id=" + COC_PACKAGE;

    @PluginMethod
    public void openClash(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent launch = pm.getLaunchIntentForPackage(COC_PACKAGE);
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(launch);
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
            return;
        }
        try {
            Intent store = new Intent(Intent.ACTION_VIEW, Uri.parse(PLAY_MARKET));
            store.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(store);
        } catch (Exception e) {
            Intent web = new Intent(Intent.ACTION_VIEW, Uri.parse(PLAY_WEB));
            web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(web);
        }
        JSObject ret = new JSObject();
        ret.put("opened", false);
        call.resolve(ret);
    }
}
