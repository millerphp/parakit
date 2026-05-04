import { Injectable } from '@angular/core';
import { registerPlugin } from '@capacitor/core';

interface PhotoPlugin {
  capture(): Promise<{ path?: string; size?: number; cancelled?: boolean }>;
  deleteFile(options: { path: string }): Promise<{ deleted: boolean }>;
}

const Photo = registerPlugin<PhotoPlugin>('Photo');

export interface CaptureResult {
  cancelled: boolean;
  path?: string;
  size?: number;
}

@Injectable({ providedIn: 'root' })
export class PhotoService {
  async capture(): Promise<CaptureResult> {
    const r = await Photo.capture();
    if (r.cancelled) return { cancelled: true };
    return { cancelled: false, path: r.path, size: r.size };
  }

  async deleteFile(path: string): Promise<boolean> {
    const { deleted } = await Photo.deleteFile({ path });
    return deleted;
  }
}
