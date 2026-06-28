package tech.christophermiller.parakit;

import android.Manifest;
import android.media.MediaRecorder;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.IOException;

@CapacitorPlugin(
    name = "VoiceRecorder",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class VoiceRecorderPlugin extends Plugin {

    private MediaRecorder recorder;
    private File outputFile;
    private long startedAtMs = 0;

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("microphone") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("microphone", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("microphone") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (recorder != null) {
            call.reject("Already recording.");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission not granted.");
            return;
        }

        try {
            File dir = new File(getContext().getFilesDir(), "evp");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Could not create storage directory.");
                return;
            }
            outputFile = uniqueFile(dir, "evp", ".m4a");

            // Constructor with context is required on API 31+; legacy ctor is deprecated but still works.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                recorder = new MediaRecorder(getContext());
            } else {
                recorder = new MediaRecorder();
            }
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioChannels(1);
            recorder.setAudioEncodingBitRate(96000);
            recorder.setAudioSamplingRate(44100);
            recorder.setOutputFile(outputFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();
            startedAtMs = System.currentTimeMillis();

            JSObject result = new JSObject();
            result.put("path", outputFile.getAbsolutePath());
            result.put("startedAt", startedAtMs);
            call.resolve(result);
        } catch (IOException | IllegalStateException e) {
            cleanupFailedStart();
            call.reject("Failed to start recording: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (recorder == null || outputFile == null) {
            call.reject("Not recording.");
            return;
        }
        String path = outputFile.getAbsolutePath();
        long stoppedAtMs = System.currentTimeMillis();
        long durationMs = stoppedAtMs - startedAtMs;
        long size = 0;

        try {
            recorder.stop();
        } catch (RuntimeException e) {
            // stop() can throw if start was too brief; the file may still exist.
            if (outputFile.exists()) {
                outputFile.delete();
            }
            try { recorder.release(); } catch (RuntimeException ignored) {}
            recorder = null;
            outputFile = null;
            startedAtMs = 0;
            call.reject("Recording was too short or failed: " + e.getMessage());
            return;
        }
        // Release before reading length: some OEM ROMs don't flush the MP4
        // container header until release(), so file length is only accurate
        // after the recorder is fully closed.
        try { recorder.release(); } catch (RuntimeException ignored) {}
        size = outputFile.length();
        recorder = null;
        outputFile = null;
        startedAtMs = 0;

        JSObject result = new JSObject();
        result.put("path", path);
        result.put("durationMs", durationMs);
        result.put("size", size);
        call.resolve(result);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        if (recorder == null) {
            call.resolve();
            return;
        }
        try { recorder.stop(); } catch (RuntimeException ignored) { /* discarding */ }
        try { recorder.release(); } catch (RuntimeException ignored) { /* already released */ }
        recorder = null;
        if (outputFile != null && outputFile.exists()) {
            outputFile.delete();
        }
        outputFile = null;
        startedAtMs = 0;
        call.resolve();
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
        JSObject result = new JSObject();
        result.put("deleted", ok);
        call.resolve(result);
    }

    private void cleanupFailedStart() {
        if (recorder != null) {
            try { recorder.release(); } catch (RuntimeException ignored) {}
            recorder = null;
        }
        if (outputFile != null && outputFile.exists()) {
            outputFile.delete();
        }
        outputFile = null;
        startedAtMs = 0;
    }

    @Override
    protected void handleOnDestroy() {
        if (recorder != null) {
            try { recorder.stop(); } catch (RuntimeException ignored) {}
            try { recorder.release(); } catch (RuntimeException ignored) {}
            recorder = null;
        }
        if (outputFile != null && outputFile.exists()) {
            outputFile.delete();
        }
        outputFile = null;
        super.handleOnDestroy();
    }

    /**
     * Build a path that doesn't exist yet — millisecond timestamps can collide
     * on rapid-fire captures or after a backup restore reuses a stamp.
     */
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
