package tech.christophermiller.parakit;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "Photo")
public class PhotoPlugin extends Plugin {

    private File pendingFile;

    @PluginMethod
    public void capture(PluginCall call) {
        try {
            File dir = new File(getContext().getFilesDir(), "photos");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Could not create photo directory.");
                return;
            }
            File file = uniqueFile(dir, "photo", ".jpg");

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );

            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("No camera app available on this device.");
                return;
            }

            pendingFile = file;
            startActivityForResult(call, intent, "captureCallback");
        } catch (Exception e) {
            pendingFile = null;
            call.reject("Failed to launch camera: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void captureCallback(PluginCall call, ActivityResult result) {
        File file = pendingFile;
        pendingFile = null;

        if (file == null) {
            call.reject("No pending capture.");
            return;
        }

        if (result.getResultCode() == Activity.RESULT_OK && file.exists() && file.length() > 0) {
            JSObject ret = new JSObject();
            ret.put("path", file.getAbsolutePath());
            ret.put("size", file.length());
            call.resolve(ret);
        } else {
            if (file.exists()) {
                file.delete();
            }
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Missing 'path'.");
            return;
        }
        File f = new File(path);
        boolean ok = !f.exists() || f.delete();
        JSObject ret = new JSObject();
        ret.put("deleted", ok);
        call.resolve(ret);
    }

    private File uniqueFile(File dir, String prefix, String ext) {
        long base = System.currentTimeMillis();
        File candidate = new File(dir, prefix + "-" + base + ext);
        int suffix = 0;
        while (candidate.exists()) {
            suffix++;
            candidate = new File(dir, prefix + "-" + base + "-" + suffix + ext);
        }
        return candidate;
    }
}
