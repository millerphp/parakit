package tech.christophermiller.parakit;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "Storage")
public class StoragePlugin extends Plugin {

    // Recursive listFiles can stutter the UI if a session has hundreds of media
    // files; do the walk on a worker thread.
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    protected void handleOnDestroy() {
        io.shutdown();
        try {
            if (!io.awaitTermination(2, TimeUnit.SECONDS)) {
                io.shutdownNow();
            }
        } catch (InterruptedException e) {
            io.shutdownNow();
            Thread.currentThread().interrupt();
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getEvidenceUsage(PluginCall call) {
        File files = getContext().getFilesDir();
        io.execute(() -> {
            long photos = sizeOf(new File(files, "photos"));
            long videos = sizeOf(new File(files, "videos"));
            long evp = sizeOf(new File(files, "evp"));

            JSObject result = new JSObject();
            result.put("photosBytes", photos);
            result.put("videosBytes", videos);
            result.put("evpBytes", evp);
            result.put("totalBytes", photos + videos + evp);
            call.resolve(result);
        });
    }

    private long sizeOf(File dir) {
        if (dir == null || !dir.exists() || !dir.isDirectory()) return 0;
        long total = 0;
        File[] children = dir.listFiles();
        if (children == null) return 0;
        for (File f : children) {
            if (f.isFile()) total += f.length();
            else if (f.isDirectory()) total += sizeOf(f);
        }
        return total;
    }
}
