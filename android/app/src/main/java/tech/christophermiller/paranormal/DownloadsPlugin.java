package tech.christophermiller.parakit;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

@CapacitorPlugin(name = "Downloads")
public class DownloadsPlugin extends Plugin {

    // Zipping potentially-large media files needs to be off the main thread,
    // otherwise the UI freezes for the whole duration of the write.
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    protected void handleOnDestroy() {
        io.shutdown();
        try {
            // Give in-flight zip writes a chance to flush rather than tearing
            // them down silently. After 5s we forcefully cancel anything left.
            if (!io.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)) {
                io.shutdownNow();
            }
        } catch (InterruptedException e) {
            io.shutdownNow();
            Thread.currentThread().interrupt();
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void saveTextWithPicker(PluginCall call) {
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "text/markdown");
        if (fileName == null) {
            call.reject("Missing 'fileName'.");
            return;
        }
        startActivityForResult(call, buildPickerIntent(mimeType, fileName), "saveTextCallback");
    }

    @PluginMethod
    public void saveFileWithPicker(PluginCall call) {
        String srcPath = call.getString("srcPath");
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (srcPath == null || fileName == null) {
            call.reject("Missing 'srcPath' or 'fileName'.");
            return;
        }
        if (!new File(srcPath).exists()) {
            call.reject("Source file does not exist.");
            return;
        }
        startActivityForResult(call, buildPickerIntent(mimeType, fileName), "saveFileCallback");
    }

    @PluginMethod
    public void pickAndExtractBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/zip");
        // Some pickers refuse to show .zip if the mime type is too restrictive;
        // also accept octet-stream as a fallback.
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/zip", "application/octet-stream" });
        startActivityForResult(call, intent, "extractBackupCallback");
    }

    @ActivityCallback
    private void extractBackupCallback(PluginCall call, ActivityResult result) {
        Uri uri = uriFrom(result);
        if (uri == null) {
            resolveCancelled(call);
            return;
        }
        // Zip extraction can be slow for backups containing many large media
        // files — push it to the worker thread.
        io.execute(() -> extractBackupFromUri(call, uri));
    }

    private void extractBackupFromUri(PluginCall call, Uri uri) {
        String manifestJson = null;
        JSObject fileMap = new JSObject();
        // Track everything we wrote so we can roll back on failure.
        java.util.List<File> extractedSoFar = new java.util.ArrayList<>();

        try (InputStream raw = getContext().getContentResolver().openInputStream(uri);
             ZipInputStream zip = raw == null ? null : new ZipInputStream(raw)) {
            if (zip == null) throw new IOException("openInputStream returned null.");

            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (entry.isDirectory()) {
                    zip.closeEntry();
                    continue;
                }

                if ("manifest.json".equals(name)) {
                    manifestJson = readEntryAsText(zip);
                } else if (isMediaEntry(name)) {
                    File saved = extractMediaEntry(zip, name);
                    extractedSoFar.add(saved);
                    fileMap.put(name, saved.getAbsolutePath());
                }
                // Anything else is silently skipped.
                zip.closeEntry();
            }

            if (manifestJson == null) {
                // Roll back any media we extracted before realising the manifest
                // was missing — these are orphans with nothing to attach to.
                for (File f : extractedSoFar) {
                    if (f.exists()) f.delete();
                }
                call.reject("Backup file does not contain a manifest.json.");
                return;
            }

            JSObject ret = new JSObject();
            ret.put("cancelled", false);
            ret.put("manifest", manifestJson);
            ret.put("fileMap", fileMap);
            call.resolve(ret);
        } catch (IOException e) {
            // Roll back extracted files so a failed import doesn't leave junk
            // accumulating in app storage.
            for (File f : extractedSoFar) {
                if (f.exists()) f.delete();
            }
            call.reject("Failed to read backup: " + e.getMessage());
        }
    }

    private boolean isMediaEntry(String name) {
        return name.startsWith("photos/") || name.startsWith("videos/") || name.startsWith("evp/");
    }

    private String readEntryAsText(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] tmp = new byte[8192];
        int n;
        // Use n != -1 — n == 0 is a valid mid-stream return on some impls.
        while ((n = in.read(tmp)) != -1) {
            if (n > 0) buf.write(tmp, 0, n);
        }
        return buf.toString("UTF-8");
    }

    private File extractMediaEntry(InputStream in, String entryName) throws IOException {
        File filesDir = getContext().getFilesDir();
        File dest = new File(filesDir, entryName);

        // Path-traversal guard: a malicious zip could contain entries like
        // "photos/../../../../etc/passwd". Reject anything that resolves
        // outside our private files dir.
        String filesCanonical = filesDir.getCanonicalPath();
        String destCanonical = dest.getCanonicalPath();
        if (!destCanonical.startsWith(filesCanonical + File.separator)
                && !destCanonical.equals(filesCanonical)) {
            throw new IOException("Refusing to extract entry that escapes app storage: " + entryName);
        }

        File parent = dest.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("Could not create destination directory.");
        }
        // Avoid clobbering an existing file (e.g. user re-imports same backup).
        // Suffix with a timestamp so each import produces unique paths.
        if (dest.exists()) {
            String fname = dest.getName();
            int dot = fname.lastIndexOf('.');
            String stem = dot > 0 ? fname.substring(0, dot) : fname;
            String ext = dot > 0 ? fname.substring(dot) : "";
            dest = new File(dest.getParentFile(), stem + "-" + System.currentTimeMillis() + ext);
        }

        boolean ok = false;
        try (FileOutputStream out = new FileOutputStream(dest)) {
            byte[] tmp = new byte[8192];
            int n;
            while ((n = in.read(tmp)) != -1) {
                if (n > 0) out.write(tmp, 0, n);
            }
            ok = true;
        } finally {
            // If write threw partway through, clean up the half-written file.
            if (!ok && dest.exists()) {
                dest.delete();
            }
        }
        return dest;
    }

    @PluginMethod
    public void saveZipWithPicker(PluginCall call) {
        String fileName = call.getString("fileName");
        JSArray entries = call.getArray("entries");
        if (fileName == null || entries == null) {
            call.reject("Missing 'fileName' or 'entries'.");
            return;
        }
        startActivityForResult(call, buildPickerIntent("application/zip", fileName), "saveZipCallback");
    }

    @ActivityCallback
    private void saveTextCallback(PluginCall call, ActivityResult result) {
        Uri uri = uriFrom(result);
        if (uri == null) {
            resolveCancelled(call);
            return;
        }
        String text = call.getString("text", "");
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new IOException("openOutputStream returned null.");
            out.write(text.getBytes(StandardCharsets.UTF_8));
            resolveSaved(call, uri);
        } catch (IOException e) {
            call.reject("Failed to save: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void saveFileCallback(PluginCall call, ActivityResult result) {
        Uri uri = uriFrom(result);
        if (uri == null) {
            resolveCancelled(call);
            return;
        }
        String srcPath = call.getString("srcPath");
        if (srcPath == null) {
            call.reject("Missing 'srcPath' on resume.");
            return;
        }
        try (FileInputStream in = new FileInputStream(srcPath);
             OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new IOException("openOutputStream returned null.");
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
            }
            resolveSaved(call, uri);
        } catch (IOException e) {
            call.reject("Failed to save: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void saveZipCallback(PluginCall call, ActivityResult result) {
        final Uri uri = uriFrom(result);
        if (uri == null) {
            resolveCancelled(call);
            return;
        }
        final JSArray entries = call.getArray("entries");
        if (entries == null) {
            call.reject("Missing 'entries' on resume.");
            return;
        }

        // Hand off the zip-build to a worker thread so the WebView UI stays responsive.
        // call.resolve / reject are thread-safe (they post back via the bridge).
        io.execute(() -> writeZipToUri(call, uri, entries));
    }

    private void writeZipToUri(PluginCall call, Uri uri, JSArray entries) {
        try (OutputStream rawOut = getContext().getContentResolver().openOutputStream(uri);
             ZipOutputStream zip = rawOut == null ? null : new ZipOutputStream(rawOut)) {
            if (zip == null) throw new IOException("openOutputStream returned null.");

            for (int i = 0; i < entries.length(); i++) {
                JSONObject obj = entries.getJSONObject(i);
                String name = obj.getString("name");
                String srcPath = obj.has("srcPath") && !obj.isNull("srcPath") ? obj.getString("srcPath") : null;
                String text = obj.has("text") && !obj.isNull("text") ? obj.getString("text") : null;

                zip.putNextEntry(new ZipEntry(name));
                if (srcPath != null && !srcPath.isEmpty()) {
                    try (FileInputStream fis = new FileInputStream(srcPath)) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = fis.read(buf)) > 0) {
                            zip.write(buf, 0, n);
                        }
                    } catch (IOException copyError) {
                        // skip files that can't be read but keep building the zip
                    }
                } else if (text != null) {
                    zip.write(text.getBytes(StandardCharsets.UTF_8));
                }
                zip.closeEntry();
            }
            resolveSaved(call, uri);
        } catch (IOException | JSONException e) {
            call.reject("Failed to save zip: " + e.getMessage());
        }
    }

    private Intent buildPickerIntent(String mimeType, String fileName) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        return intent;
    }

    private Uri uriFrom(ActivityResult result) {
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            return null;
        }
        return result.getData().getData();
    }

    private void resolveSaved(PluginCall call, Uri uri) {
        JSObject ret = new JSObject();
        ret.put("cancelled", false);
        ret.put("uri", uri.toString());
        call.resolve(ret);
    }

    private void resolveCancelled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("cancelled", true);
        call.resolve(ret);
    }
}
