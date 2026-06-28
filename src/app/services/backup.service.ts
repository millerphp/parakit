import { Injectable, inject } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import { Evidence, InvestigationRecord, InvestigationStore } from '../investigation.store';
import { APP_VERSION } from '../shared/app-version';

interface ZipEntryInput {
  name: string;
  srcPath?: string;
  text?: string;
}

interface DownloadsPluginShape {
  saveZipWithPicker(options: {
    fileName: string;
    entries: ZipEntryInput[];
  }): Promise<{ cancelled: boolean; uri?: string }>;
  pickAndExtractBackup(): Promise<{
    cancelled: boolean;
    manifest?: string;
    fileMap?: Record<string, string>;
  }>;
}

const Downloads = registerPlugin<DownloadsPluginShape>('Downloads');

const BACKUP_FORMAT_VERSION = 1;

interface BackupManifest {
  version: number;
  exportedAt: string;
  appVersion: string;
  investigations: InvestigationRecord[];
}

export type ExportOutcome =
  | { exported: true; fileName: string; investigationCount: number; mediaFileCount: number }
  | { exported: false };

export type ImportOutcome =
  | { imported: true; added: number; skipped: number }
  | { imported: false; reason?: string };

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly store = inject(InvestigationStore);

  async exportAll(appVersion: string = APP_VERSION): Promise<ExportOutcome> {
    const records = this.store.history();
    const manifest: BackupManifest = {
      version: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion,
      investigations: records.map((r) => ({
        ...r,
        evidence: (r.evidence ?? []).map((e) => this.rewriteEvidenceForExport(e))
      }))
    };

    const entries: ZipEntryInput[] = [
      { name: 'manifest.json', text: JSON.stringify(manifest, null, 2) }
    ];

    let mediaCount = 0;
    let skippedCount = 0;
    for (const r of records) {
      for (const e of r.evidence ?? []) {
        if (e.type === 'photo' || e.type === 'video' || e.type === 'evp') {
          const rel = this.toRelativePath(e.filePath);
          if (!rel) {
            // Refuse to write paths that don't conform to our internal layout —
            // they'd produce nonsense entry names and become a path-traversal
            // vector on import. Drop them with a console note instead.
            console.warn(`[Paranormal][Backup] skipping non-conforming media path: ${e.filePath}`);
            skippedCount++;
            continue;
          }
          entries.push({ name: rel, srcPath: e.filePath });
          mediaCount++;
        }
      }
    }
    if (skippedCount > 0) {
      console.warn(`[Paranormal][Backup] export skipped ${skippedCount} non-conforming media path(s)`);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `parakit-backup-${stamp}.zip`;
    const result = await Downloads.saveZipWithPicker({ fileName, entries });
    if (result.cancelled || !result.uri) {
      return { exported: false };
    }
    return { exported: true, fileName, investigationCount: records.length, mediaFileCount: mediaCount };
  }

  async importBackup(): Promise<ImportOutcome> {
    let result: { cancelled: boolean; manifest?: string; fileMap?: Record<string, string> };
    try {
      result = await Downloads.pickAndExtractBackup();
    } catch (err) {
      return { imported: false, reason: err instanceof Error ? err.message : 'Import failed.' };
    }

    if (result.cancelled || !result.manifest) {
      return { imported: false };
    }

    let manifest: BackupManifest;
    try {
      manifest = JSON.parse(result.manifest) as BackupManifest;
    } catch {
      return { imported: false, reason: 'Backup manifest is not valid JSON.' };
    }

    if (!manifest.investigations || !Array.isArray(manifest.investigations)) {
      return { imported: false, reason: 'Backup manifest is missing investigations.' };
    }
    if (typeof manifest.version !== 'number' || !Number.isFinite(manifest.version)) {
      return { imported: false, reason: 'Backup manifest has an invalid version number.' };
    }
    if (manifest.version > BACKUP_FORMAT_VERSION) {
      return {
        imported: false,
        reason: `Backup was created with a newer app version (format v${manifest.version}). Update the app and try again.`
      };
    }

    const fileMap = result.fileMap ?? {};
    let added = 0;
    let skipped = 0;

    // Suspend persist across the whole loop so we write localStorage once,
    // not once per imported investigation.
    this.store.withBatchedPersist(() => {
      for (const inv of manifest.investigations) {
        const restored: InvestigationRecord = {
          ...inv,
          evidence: (inv.evidence ?? []).map((e) => this.rewriteEvidenceForImport(e, fileMap))
        };
        const wasAdded = this.store.importInvestigation(restored);
        if (wasAdded) added++;
        else skipped++;
      }
    });

    return { imported: true, added, skipped };
  }

  /**
   * Convert an absolute device path like
   *   /data/data/.../files/photos/photo-12345.jpg
   * into the zip-relative form
   *   photos/photo-12345.jpg
   * Returns null if the path doesn't end in one of our known media subdirs —
   * the export caller skips those instead of writing a nonsense zip entry.
   */
  private toRelativePath(absPath: string): string | null {
    const segs = absPath.split('/').filter(Boolean);
    if (segs.length < 2) return null;
    const parent = segs[segs.length - 2];
    const filename = segs[segs.length - 1];
    if (parent === 'photos' || parent === 'videos' || parent === 'evp') {
      // Reject filenames containing path separators (defence-in-depth even
      // though our writers never produce such names).
      if (filename.includes('/') || filename === '..' || filename.startsWith('.')) {
        return null;
      }
      return `${parent}/${filename}`;
    }
    return null;
  }

  private rewriteEvidenceForExport(e: Evidence): Evidence {
    if (e.type === 'photo' || e.type === 'video' || e.type === 'evp') {
      const rel = this.toRelativePath(e.filePath);
      // If the path can't be relativised, leave the evidence record absent of
      // a useful filePath. Combined with the export skip above, the manifest
      // ends up referencing a missing entry, which the import code already
      // handles gracefully.
      return { ...e, filePath: rel ?? '' };
    }
    return e;
  }

  private rewriteEvidenceForImport(e: Evidence, fileMap: Record<string, string>): Evidence {
    if (e.type === 'photo' || e.type === 'video' || e.type === 'evp') {
      const newPath = fileMap[e.filePath];
      if (newPath) {
        return { ...e, filePath: newPath };
      }
      // File missing from zip but referenced in manifest — keep the relative
      // path so the user can see something exists, but the player will fail
      // to load. This shouldn't happen with our own export but we guard against
      // hand-edited backups.
      return e;
    }
    return e;
  }
}
