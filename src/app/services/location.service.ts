import { Injectable } from '@angular/core';
import { Geolocation, PermissionStatus, Position } from '@capacitor/geolocation';

export interface LocationSnapshot {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  altitudeMeters: number | null;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  capturedAt: string;
  fixAgeMs: number;
  totalElapsedMs: number;
}

export class LocationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly nativeCode?: string,
    readonly nativeMessage?: string
  ) {
    super(message);
    this.name = 'LocationError';
  }
}

interface GetCurrentPositionOptions {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}

const FAST_STAGE: GetCurrentPositionOptions = {
  enableHighAccuracy: false,
  timeout: 6000,
  maximumAge: 600000
};

const PRECISE_STAGE: GetCurrentPositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60000
};

const TIMEOUT_CODE = 'OS-PLUG-GLOC-0010';
const POSITION_UNAVAILABLE_CODE = 'OS-PLUG-GLOC-0002';

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private static readonly LOG = '[Paranormal][LocationService]';

  async getCurrentPosition(onStage?: (stage: 'fast' | 'precise') => void): Promise<LocationSnapshot> {
    const t0 = performance.now();
    this.info('getCurrentPosition: start');

    await this.ensurePermission();

    onStage?.('fast');
    try {
      const snap = await this.attempt('fast', FAST_STAGE, t0);
      return snap;
    } catch (err) {
      const code = err instanceof LocationError ? err.nativeCode : undefined;
      const recoverable = code === TIMEOUT_CODE || code === POSITION_UNAVAILABLE_CODE || code === undefined;
      if (!recoverable) {
        throw err;
      }
      this.info(
        `getCurrentPosition: fast stage failed nativeCode=${code ?? 'n/a'} — ` +
          `escalating to precise stage with high accuracy`
      );
    }

    onStage?.('precise');
    return this.attempt('precise', PRECISE_STAGE, t0);
  }

  private async attempt(
    stage: 'fast' | 'precise',
    options: GetCurrentPositionOptions,
    t0: number
  ): Promise<LocationSnapshot> {
    this.info(`getCurrentPosition[${stage}]: requesting fix options=${JSON.stringify(options)}`);
    const tFix = performance.now();

    let position: Position;
    try {
      position = await Geolocation.getCurrentPosition(options);
    } catch (raw) {
      const mapped = this.mapError(raw);
      this.error(
        `getCurrentPosition[${stage}]: failed nativeCode=${mapped.nativeCode ?? 'n/a'} ` +
          `nativeMessage="${mapped.nativeMessage ?? ''}" fixMs=${this.elapsed(tFix)}`
      );
      throw mapped;
    }

    const fixMs = this.elapsed(tFix);
    const totalMs = this.elapsed(t0);
    const snapshot = this.toSnapshot(position, fixMs, totalMs);

    this.info(
      `getCurrentPosition[${stage}]: success lat=${snapshot.latitude.toFixed(5)} lon=${snapshot.longitude.toFixed(5)} ` +
        `accuracy=${this.fmt(snapshot.accuracyMeters)}m altitude=${this.fmt(snapshot.altitudeMeters)}m ` +
        `fixCapturedAt=${snapshot.capturedAt} fixSystemAgeMs=${Date.now() - position.timestamp} ` +
        `fixMs=${fixMs} totalMs=${totalMs}`
    );

    return snapshot;
  }

  private async ensurePermission(): Promise<void> {
    let status: PermissionStatus;
    try {
      status = await Geolocation.checkPermissions();
    } catch (raw) {
      const mapped = this.mapError(raw);
      this.error(`checkPermissions: failed nativeCode=${mapped.nativeCode ?? 'n/a'}`);
      throw mapped;
    }
    this.info(`checkPermissions: location=${status.location} coarseLocation=${status.coarseLocation}`);

    if (status.location === 'granted' || status.coarseLocation === 'granted') {
      return;
    }

    if (status.location === 'denied') {
      throw new LocationError(
        'Location permission was denied. Open Settings → Apps → ParaKit: Investigation Toolkit → Permissions and grant Location access, then retry.',
        'PERMISSION_DENIED_PERMANENT'
      );
    }

    this.info('requestPermissions: prompting user');
    const tReq = performance.now();
    let result: PermissionStatus;
    try {
      result = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
    } catch (raw) {
      const mapped = this.mapError(raw);
      this.error(`requestPermissions: failed nativeCode=${mapped.nativeCode ?? 'n/a'}`);
      throw mapped;
    }
    this.info(
      `requestPermissions: result location=${result.location} coarseLocation=${result.coarseLocation} ` +
        `elapsedMs=${this.elapsed(tReq)}`
    );

    if (result.location !== 'granted' && result.coarseLocation !== 'granted') {
      throw new LocationError(
        'Location permission denied. The app needs GPS access to log an investigation.',
        'PERMISSION_DENIED'
      );
    }
  }

  private mapError(raw: unknown): LocationError {
    if (raw instanceof LocationError) {
      return raw;
    }
    const nativeCode = (raw as { code?: string })?.code;
    const nativeMessage = raw instanceof Error ? raw.message : String(raw);

    const friendly = this.friendlyMessageFor(nativeCode, nativeMessage);
    return new LocationError(friendly, nativeCode ?? 'UNKNOWN', nativeCode, nativeMessage);
  }

  private friendlyMessageFor(code: string | undefined, fallback: string): string {
    switch (code) {
      case 'OS-PLUG-GLOC-0002':
        return 'Could not get a position fix. Move outdoors or near a window and retry.';
      case 'OS-PLUG-GLOC-0003':
        return 'Location permission was denied. Grant Location access in Settings and retry.';
      case 'OS-PLUG-GLOC-0007':
        return 'Location services are turned off. Enable Location in your device settings.';
      case 'OS-PLUG-GLOC-0009':
        return 'Request to enable location was declined.';
      case 'OS-PLUG-GLOC-0010':
        return 'Timed out waiting for a GPS fix. Retry, or move somewhere with a clearer sky view.';
      case 'OS-PLUG-GLOC-0014':
      case 'OS-PLUG-GLOC-0015':
        return 'Google Play services error — geolocation is unavailable on this device.';
      case 'OS-PLUG-GLOC-0016':
        return 'Could not access location settings.';
      case 'OS-PLUG-GLOC-0017':
        return 'Both Network and GPS location are turned off. Enable Location in device settings.';
      default:
        return fallback || 'Unable to capture location.';
    }
  }

  private toSnapshot(position: Position, fixAgeMs: number, totalElapsedMs: number): LocationSnapshot {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy ?? null,
      altitudeMeters: position.coords.altitude ?? null,
      speedMetersPerSecond: position.coords.speed ?? null,
      headingDegrees: position.coords.heading ?? null,
      capturedAt: new Date(position.timestamp).toISOString(),
      fixAgeMs,
      totalElapsedMs
    };
  }

  private elapsed(start: number): number {
    return Math.round(performance.now() - start);
  }

  private fmt(value: number | null): string {
    return value === null ? 'n/a' : String(Math.round(value));
  }

  private info(message: string): void {
    console.info(`${LocationService.LOG} ${message}`);
  }

  private error(message: string): void {
    console.error(`${LocationService.LOG} ${message}`);
  }
}
