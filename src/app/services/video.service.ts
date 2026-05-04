import { Injectable } from '@angular/core';
import { registerPlugin } from '@capacitor/core';

interface VideoPlugin {
  capture(): Promise<{ path?: string; size?: number; durationMs?: number; cancelled?: boolean }>;
  deleteFile(options: { path: string }): Promise<{ deleted: boolean }>;
}

const Video = registerPlugin<VideoPlugin>('Video');

export interface VideoCaptureResult {
  cancelled: boolean;
  path?: string;
  size?: number;
  durationMs?: number;
}

@Injectable({ providedIn: 'root' })
export class VideoService {
  async capture(): Promise<VideoCaptureResult> {
    const r = await Video.capture();
    if (r.cancelled) return { cancelled: true };
    return {
      cancelled: false,
      path: r.path,
      size: r.size,
      durationMs: r.durationMs ?? 0
    };
  }

  async deleteFile(path: string): Promise<boolean> {
    const { deleted } = await Video.deleteFile({ path });
    return deleted;
  }
}
