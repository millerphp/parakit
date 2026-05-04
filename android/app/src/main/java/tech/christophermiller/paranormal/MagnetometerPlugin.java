package tech.christophermiller.parakit;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Magnetometer")
public class MagnetometerPlugin extends Plugin implements SensorEventListener {

    private SensorManager sensorManager;
    private Sensor magnetometer;
    // listening = the user wants readings (start was called and stop wasn't).
    // registered = we currently have an active OS-level subscription.
    // Splitting these lets pause/resume cleanly without losing the desired state.
    private boolean listening = false;
    private boolean registered = false;

    @Override
    public void load() {
        super.load();
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            magnetometer = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", magnetometer != null);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (sensorManager == null || magnetometer == null) {
            call.reject("No magnetometer sensor available on this device.");
            return;
        }
        listening = true;
        if (!registered) {
            // SENSOR_DELAY_GAME ≈ 50 Hz — smooth UI without burning battery.
            boolean ok = sensorManager.registerListener(this, magnetometer, SensorManager.SENSOR_DELAY_GAME);
            if (!ok) {
                listening = false;
                call.reject("Failed to register magnetometer listener.");
                return;
            }
            registered = true;
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        listening = false;
        if (registered && sensorManager != null) {
            sensorManager.unregisterListener(this);
            registered = false;
        }
        call.resolve();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_MAGNETIC_FIELD) {
            return;
        }
        if (event.values == null || event.values.length < 3) {
            return;
        }
        JSObject data = new JSObject();
        data.put("x", event.values[0]);
        data.put("y", event.values[1]);
        data.put("z", event.values[2]);
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("reading", data);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Accuracy ranges: -1 NO_CONTACT, 0 UNRELIABLE, 1 LOW, 2 MEDIUM, 3 HIGH.
        // Forward as a separate event so the JS layer can warn the user about
        // figure-8 calibration if accuracy drops.
        if (sensor != null && sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) {
            JSObject data = new JSObject();
            data.put("accuracy", accuracy);
            notifyListeners("accuracyChanged", data);
        }
    }

    @Override
    protected void handleOnPause() {
        if (registered && sensorManager != null) {
            sensorManager.unregisterListener(this);
            registered = false;
        }
        super.handleOnPause();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (listening && !registered && sensorManager != null && magnetometer != null) {
            registered = sensorManager.registerListener(this, magnetometer, SensorManager.SENSOR_DELAY_GAME);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (registered && sensorManager != null) {
            sensorManager.unregisterListener(this);
            registered = false;
            listening = false;
        }
        super.handleOnDestroy();
    }
}
