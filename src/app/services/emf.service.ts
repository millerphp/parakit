import { Injectable, NgZone, inject, signal } from '@angular/core';
import { PluginListenerHandle, registerPlugin } from '@capacitor/core';

export interface EmfReading {
  x: number;
  y: number;
  z: number;
  magnitude: number;
  timestamp: number;
}

export type EmfState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'error'; reason: string };

interface MagnetometerPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'reading',
    cb: (event: { x: number; y: number; z: number; timestamp: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'accuracyChanged',
    cb: (event: { accuracy: number }) => void
  ): Promise<PluginListenerHandle>;
}

const Magnetometer = registerPlugin<MagnetometerPlugin>('Magnetometer');

export const EMF_BIN_THRESHOLDS_MICROT = [2, 5, 10, 20, 40, 80, 150];

export function binFor(deviation: number): number {
  for (let i = 0; i < EMF_BIN_THRESHOLDS_MICROT.length; i++) {
    if (deviation < EMF_BIN_THRESHOLDS_MICROT[i]) {
      return i;
    }
  }
  return 7;
}

@Injectable({ providedIn: 'root' })
export class EmfService {
  private static readonly LOG = '[Paranormal][EmfService]';
  private static readonly LOG_EVERY_N = 25; // ~2 Hz at 50 Hz native rate
  private readonly zone = inject(NgZone);
  private readingHandle: PluginListenerHandle | null = null;
  private accuracyHandle: PluginListenerHandle | null = null;
  private tickCounter = 0;
  private readonly stateSig = signal<EmfState>({ kind: 'idle' });
  private readonly readingSig = signal<EmfReading | null>(null);
  private readonly accuracySig = signal<number | null>(null);

  readonly state = this.stateSig.asReadonly();
  readonly reading = this.readingSig.asReadonly();
  readonly accuracy = this.accuracySig.asReadonly();

  async start(): Promise<void> {
    if (this.readingHandle) {
      return;
    }
    this.stateSig.set({ kind: 'starting' });
    this.info('start: probing magnetometer plugin');

    try {
      const { available } = await Magnetometer.isAvailable();
      if (!available) {
        const reason = 'This device has no magnetometer sensor.';
        this.info(`start: unsupported — ${reason}`);
        this.stateSig.set({ kind: 'unsupported', reason });
        return;
      }

      this.readingHandle = await Magnetometer.addListener('reading', (event) => {
        const x = event.x ?? 0;
        const y = event.y ?? 0;
        const z = event.z ?? 0;
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const reading: EmfReading = { x, y, z, magnitude, timestamp: event.timestamp ?? Date.now() };
        this.tickCounter++;
        if (this.tickCounter % EmfService.LOG_EVERY_N === 0) {
          this.info(`reading #${this.tickCounter} magnitude=${magnitude.toFixed(2)} μT`);
        }
        this.zone.run(() => this.readingSig.set(reading));
      });

      this.accuracyHandle = await Magnetometer.addListener('accuracyChanged', (event) => {
        this.zone.run(() => this.accuracySig.set(event.accuracy));
        this.info(`accuracyChanged: ${event.accuracy}`);
      });

      await Magnetometer.start();
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
    this.accuracySig.set(null);
    this.stateSig.set({ kind: 'idle' });
  }

  private async cleanup(): Promise<void> {
    if (this.readingHandle) {
      try { await this.readingHandle.remove(); } catch { /* ignore */ }
      this.readingHandle = null;
    }
    if (this.accuracyHandle) {
      try { await this.accuracyHandle.remove(); } catch { /* ignore */ }
      this.accuracyHandle = null;
    }
    try { await Magnetometer.stop(); } catch { /* ignore */ }
  }

  private info(message: string): void {
    console.info(`${EmfService.LOG} ${message}`);
  }

  private error(message: string): void {
    console.error(`${EmfService.LOG} ${message}`);
  }
}
