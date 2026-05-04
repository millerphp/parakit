import { Injectable, signal } from '@angular/core';
import { registerPlugin } from '@capacitor/core';

interface StoragePlugin {
  getEvidenceUsage(): Promise<{
    photosBytes: number;
    videosBytes: number;
    evpBytes: number;
    totalBytes: number;
  }>;
}

const Storage = registerPlugin<StoragePlugin>('Storage');

export interface StorageUsage {
  photosBytes: number;
  videosBytes: number;
  evpBytes: number;
  totalBytes: number;
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly usageSig = signal<StorageUsage | null>(null);
  readonly usage = this.usageSig.asReadonly();

  async refresh(): Promise<void> {
    try {
      const r = await Storage.getEvidenceUsage();
      this.usageSig.set(r);
    } catch {
      this.usageSig.set(null);
    }
  }
}

// formatBytes lives in shared/formatters now — re-export so existing imports keep working.
export { formatBytes } from '../shared/formatters';
