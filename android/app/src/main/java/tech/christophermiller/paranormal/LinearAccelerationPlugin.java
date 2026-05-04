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

@CapacitorPlugin(name = "LinearAcceleration")
public class LinearAccelerationPlugin extends Plugin implements SensorEventListener {

    private SensorManager sensorManager;
    private Sensor sensor;
    // listening = user has called start() and not stop().
    // registered = OS-level subscription is currently active.
    private boolean listening = false;
    private boolean registered = false;

    @Override
    public void load() {
        super.load();
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            // TYPE_LINEAR_ACCELERATION returns x/y/z in m/s² with gravity removed.
            // A still phone on a surface should read ~0 on all axes.
            sensor = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", sensor != null);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (sensorManager == null || sensor == null) {
            call.reject("No linear-acceleration sensor available on this device.");
            return;
        }
        listening = true;
        if (!registered) {
            boolean ok = sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME);
            if (!ok) {
                listening = false;
                call.reject("Failed to register linear-acceleration listener.");
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
        if (event.sensor.getType() != Sensor.TYPE_LINEAR_ACCELERATION) {
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
        // No-op — linear-acceleration accuracy doesn't usually change post-startup.
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
        if (listening && !registered && sensorManager != null && sensor != null) {
            registered = sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (registered && sensorManager != null) {
            sensorManager.unregisterListener(this);
            registered = false;
        }
        listening = false;
        super.handleOnDestroy();
    }
}
