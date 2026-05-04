package tech.christophermiller.parakit;

import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.File;
import java.util.ArrayList;

@CapacitorPlugin(name = "Share")
public class SharePlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        String text = call.getString("text", "");
        String title = call.getString("title", "");
        String dialogTitle = call.getString("dialogTitle", "Share via");
        JSArray fileArray = call.getArray("files");

        ArrayList<Uri> uris = new ArrayList<>();
        if (fileArray != null) {
            try {
                for (int i = 0; i < fileArray.length(); i++) {
                    String path = fileArray.getString(i);
                    if (path == null) continue;
                    File file = new File(path);
                    if (!file.exists()) continue;
                    Uri uri = FileProvider.getUriForFile(
                        getContext(),
                        getContext().getPackageName() + ".fileprovider",
                        file
                    );
                    uris.add(uri);
                }
            } catch (JSONException e) {
                call.reject("Invalid 'files' array.");
                return;
            } catch (IllegalArgumentException e) {
                call.reject("Could not share file: " + e.getMessage());
                return;
            }
        }

        Intent intent;
        if (uris.size() > 1) {
            intent = new Intent(Intent.ACTION_SEND_MULTIPLE);
            intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            intent.setType(commonMimeFor(uris));
        } else if (uris.size() == 1) {
            intent = new Intent(Intent.ACTION_SEND);
            intent.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            intent.setType(mimeForUri(uris.get(0)));
        } else {
            intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/plain");
        }

        if (!text.isEmpty()) {
            intent.putExtra(Intent.EXTRA_TEXT, text);
        }
        if (!title.isEmpty()) {
            intent.putExtra(Intent.EXTRA_SUBJECT, title);
        }
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        // The chooser also needs the read-uri flag — without it some downstream
        // handlers re-launch the inner intent and lose access to our content URIs.
        Intent chooser = Intent.createChooser(intent, dialogTitle);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        try {
            // Prefer the Activity context so we don't need NEW_TASK and the
            // share sheet animates back to our app correctly.
            if (getActivity() != null) {
                getActivity().startActivity(chooser);
            } else {
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
            }
            // We resolve immediately because Android's share intent gives us no
            // post-share callback. Whether the user actually shared or backed
            // out is invisible to us — that's an OS limitation, not a bug.
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open share sheet: " + e.getMessage());
        }
    }

    private String mimeForUri(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null) return "*/*";
        String lower = name.toLowerCase();
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".m4a") || lower.endsWith(".aac")) return "audio/mp4";
        return "*/*";
    }

    private String commonMimeFor(ArrayList<Uri> uris) {
        String first = mimeForUri(uris.get(0));
        String prefix = first.split("/")[0];
        for (Uri uri : uris) {
            if (!mimeForUri(uri).startsWith(prefix + "/")) {
                return "*/*";
            }
        }
        return prefix + "/*";
    }
}
