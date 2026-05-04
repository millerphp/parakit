package tech.christophermiller.parakit;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MagnetometerPlugin.class);
        registerPlugin(LinearAccelerationPlugin.class);
        registerPlugin(VoiceRecorderPlugin.class);
        registerPlugin(PhotoPlugin.class);
        registerPlugin(VideoPlugin.class);
        registerPlugin(SharePlugin.class);
        registerPlugin(DownloadsPlugin.class);
        registerPlugin(StoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
