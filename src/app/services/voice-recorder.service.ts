import { Injectable } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import { withTimeout } from '../shared/with-timeout';

interface VoiceRecorderPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  start(): Promise<{ path: string; startedAt: number }>;
  stop(): Promise<{ path: string; durationMs: number; size: number }>;
  cancel(): Promise<void>;
  deleteFile(options: { path: string }): Promise<{ deleted: boolean }>;
}

const VoiceRecorder = registerPlugin<VoiceRecorderPlugin>('VoiceRecorder');

@Injectable({ providedIn: 'root' })
export class VoiceRecorderService {
  private static readonly LOG = '[Paranormal][VoiceRecorder]';
  // Tracks the most-recent in-flight permission request so a late-resolving
  // dialog doesn't double-resolve into stale callers.
  private pendingPermissionRequest: Promise<{ granted: boolean }> | null = null;

  async ensurePermission(): Promise<boolean> {
    const { granted } = await VoiceRecorder.checkPermission();
    if (granted) return true;
    this.info('requesting microphone permission');

    // The Android permission dialog is system-modal; some OEM ROMs never
    // resolve the underlying PluginCall if the dialog is dismissed by
    // gesture-back. Time-bound the wait so the JS side can recover instead
    // of hanging the page. After timeout we re-check directly in case the
    // dialog was answered after we gave up.
    const liveRequest = VoiceRecorder.requestPermission();
    this.pendingPermissionRequest = liveRequest;

    try {
      const result = await withTimeout(liveRequest, 45_000, 'permission dialog timed out');
      // Clear pointer if we're still the active request — late settlements
      // from earlier requests would have already nulled this.
      if (this.pendingPermissionRequest === liveRequest) {
        this.pendingPermissionRequest = null;
      }
      return result.granted;
    } catch (err) {
      this.info(`requestPermission did not resolve in time: ${err instanceof Error ? err.message : err}`);
      // Detach this promise from "current" so a late settlement is silently
      // ignored (we already gave up on it from the caller's perspective).
      if (this.pendingPermissionRequest === liveRequest) {
        this.pendingPermissionRequest = null;
      }
      // Swallow any eventual settlement so it doesn't bubble up as an
      // unhandled rejection.
      liveRequest.catch(() => undefined);

      const recheck = await VoiceRecorder.checkPermission();
      return recheck.granted;
    }
  }

  start(): Promise<{ path: string; startedAt: number }> {
    return VoiceRecorder.start();
  }

  stop(): Promise<{ path: string; durationMs: number; size: number }> {
    return VoiceRecorder.stop();
  }

  cancel(): Promise<void> {
    return VoiceRecorder.cancel();
  }

  async deleteFile(path: string): Promise<boolean> {
    const { deleted } = await VoiceRecorder.deleteFile({ path });
    return deleted;
  }

  private info(message: string): void {
    console.info(`${VoiceRecorderService.LOG} ${message}`);
  }
}
