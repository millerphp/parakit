import { Injectable, NgZone, inject, signal } from '@angular/core';
import { PluginListenerHandle, registerPlugin } from '@capacitor/core';

export interface VibrationReading {
  x: number;
  y: number;
  z: number;
  magnitude: number;
  timestamp: number;
}

export type VibrationsState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'error'; reason: string };

interface LinearAccelerationPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'reading',
    cb: (event: { x: number; y: number; z: number; timestamp: number }) => void
  ): Promise<PluginListenerHandle>;
}

const LinearAcceleration = registerPlugin<LinearAccelerationPlugin>('LinearAcceleration');

// Bin thresholds in m/s² of magnitude. A still phone reads ~0; gentle taps
// produce ~0.5–2; nearby footsteps ~0.2–0.8; strong impacts/drops 5+.
export const VIBRATION_BIN_THRESHOLDS_MS2 = [0.1, 0.3, 0.7, 1.5, 3, 6, 12];

export function vibrationBinFor(magnitude: number): number {
  for (let i = 0; i < VIBRATION_BIN_THRESHOLDS_MS2.length; i++) {
    if (magnitude < VIBRATION_BIN_THRESHOLDS_MS2[i]) {
      return i;
    }
  }
  return 7;
}

@Injectable({ providedIn: 'root' })
export class VibrationsService {
  private static readonly LOG = '[Paranormal][VibrationsService]';
  private static readonly LOG_EVERY_N = 25;
  private readonly zone = inject(NgZone);
  private readingHandle: PluginListenerHandle | null = null;
  private tickCounter = 0;
  private readonly stateSig = signal<VibrationsState>({ kind: 'idle' });
  private readonly readingSig = signal<VibrationReading | null>(null);

  readonly state = this.stateSig.asReadonly();
  readonly reading = this.readingSig.asReadonly();

  async start(): Promise<void> {
    if (this.readingHandle) {
      return;
    }
    this.stateSig.set({ kind: 'starting' });
    this.info('start: probing linear-acceleration plugin');

    try {
      const { available } = await LinearAcceleration.isAvailable();
      if (!available) {
        const reason = 'This device has no linear-acceleration sensor.';
        this.info(`start: unsupported — ${reason}`);
        this.stateSig.set({ kind: 'unsupported', reason });
        return;
      }

      this.readingHandle = await LinearAcceleration.addListener('reading', (event) => {
        const x = event.x ?? 0;
        const y = event.y ?? 0;
        const z = event.z ?? 0;
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const reading: VibrationReading = { x, y, z, magnitude, timestamp: event.timestamp ?? Date.now() };
        this.tickCounter++;
        if (this.tickCounter % VibrationsService.LOG_EVERY_N === 0) {
          this.info(`reading #${this.tickCounter} magnitude=${magnitude.toFixed(3)} m/s²`);
        }
        this.zone.run(() => this.readingSig.set(reading));
      });

      await LinearAcceleration.start();
      this.stateSig.set({ kind: 'running' });
      this.info('start: sensor running');
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown sensor error.';
      this.error(`start: failed — ${reason}`);
      this.stateSig.set({ kind: 'error', reason });
      await this.cleanup();
    }
  }

  async stop(): Promise<void> {
    this.info('stop: releasing sensor');
    await this.cleanup();
    this.readingSig.set(null);
    this.stateSig.set({ kind: 'idle' });
  }

  private async cleanup(): Promise<void> {
    if (this.readingHandle) {
      try { await this.readingHandle.remove(); } catch { /* ignore */ }
      this.readingHandle = null;
    }
    try { await LinearAcceleration.stop(); } catch { /* ignore */ }
  }

  private info(message: string): void {
    console.info(`${VibrationsService.LOG} ${message}`);
  }

  private error(message: string): void {
    console.error(`${VibrationsService.LOG} ${message}`);
  }
}
