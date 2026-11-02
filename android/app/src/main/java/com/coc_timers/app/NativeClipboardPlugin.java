package com.coc_timers.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeClipboard")
public class NativeClipboardPlugin extends Plugin {
    @PluginMethod
    public void read(PluginCall call) {
        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
            JSObject ret = new JSObject();
            try {
                Context context = getContext();
                ClipboardManager manager = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                if (manager == null || !manager.hasPrimaryClip()) {
                    ret.put("value", "");
                    call.resolve(ret);
                    return;
                }
                ClipData clip = manager.getPrimaryClip();
                if (clip == null || clip.getItemCount() < 1) {
                    ret.put("value", "");
                    call.resolve(ret);
                    return;
                }
                CharSequence text = clip.getItemAt(0).coerceToText(context);
                ret.put("value", text != null ? text.toString() : "");
                call.resolve(ret);
            } catch (Exception error) {
                call.reject(error.getMessage());
            }
        });
    }
}
