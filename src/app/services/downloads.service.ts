import { Injectable } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import { Evidence, InvestigationRecord } from '../investigation.store';
import {
  buildEvidenceMarkdown,
  buildInvestigationMarkdown,
  extensionFor,
  investigationFolderName
} from './investigation-formatters';

interface ZipEntryInput {
  name: string;
  srcPath?: string;
  text?: string;
}

interface PickerResult {
  cancelled: boolean;
  uri?: string;
}

interface DownloadsPlugin {
  saveTextWithPicker(options: { text: string; fileName: string; mimeType?: string }): Promise<PickerResult>;
  saveFileWithPicker(options: { srcPath: string; fileName: string; mimeType?: string }): Promise<PickerResult>;
  saveZipWithPicker(options: { fileName: string; entries: ZipEntryInput[] }): Promise<PickerResult>;
}

const Downloads = registerPlugin<DownloadsPlugin>('Downloads');

export type DownloadOutcome = { saved: true; uri: string; fileName: string } | { saved: false };

@Injectable({ providedIn: 'root' })
export class DownloadsService {
  async downloadInvestigation(record: InvestigationRecord): Promise<DownloadOutcome & { fileCount?: number }> {
    const folder = investigationFolderName(record);
    const summaryEntry: ZipEntryInput = {
      name: `${folder}/summary.md`,
      text: buildInvestigationMarkdown(record)
    };
    const entries: ZipEntryInput[] = [summaryEntry];

    let mediaIndex = 0;
    for (const e of record.evidence ?? []) {
      if (e.type === 'photo' || e.type === 'video' || e.type === 'evp') {
        mediaIndex++;
        const ext = extensionFor(e.filePath, defaultExtFor(e));
        const stamp = isoStamp(e.capturedAt);
        entries.push({
          name: `${folder}/${stamp}-${e.type}-${mediaIndex}.${ext}`,
          srcPath: e.filePath
        });
      } else if (e.type === 'field-note') {
        // Field notes get inlined into a per-investigation notes.md too.
        // Skipped here — they're already in summary.md.
      }
    }

    const fileName = `${folder}.zip`;
    const result = await Downloads.saveZipWithPicker({ fileName, entries });
    if (result.cancelled || !result.uri) {
      return { saved: false };
    }
    return { saved: true, uri: result.uri, fileName, fileCount: entries.length };
  }

  async downloadEvidence(record: InvestigationRecord, evidence: Evidence): Promise<DownloadOutcome> {
    const folder = investigationFolderName(record);
    const stamp = isoStamp(evidence.capturedAt);

    if (evidence.type === 'photo' || evidence.type === 'video' || evidence.type === 'evp') {
      const ext = extensionFor(evidence.filePath, defaultExtFor(evidence));
      const fileName = `${folder}-${stamp}-${evidence.type}.${ext}`;
      const result = await Downloads.saveFileWithPicker({
        srcPath: evidence.filePath,
        fileName,
        mimeType: mimeFor(evidence)
      });
      if (result.cancelled || !result.uri) return { saved: false };
      return { saved: true, uri: result.uri, fileName };
    }

    const fileName = `${folder}-${stamp}-${evidence.type}.md`;
    const result = await Downloads.saveTextWithPicker({
      text: buildEvidenceMarkdown(record, evidence),
      fileName,
      mimeType: 'text/markdown'
    });
    if (result.cancelled || !result.uri) return { saved: false };
    return { saved: true, uri: result.uri, fileName };
  }
}

function mimeFor(e: Evidence): string {
  switch (e.type) {
    case 'photo': return 'image/jpeg';
    case 'video': return 'video/mp4';
    case 'evp': return 'audio/mp4';
    default: return 'application/octet-stream';
  }
}

function defaultExtFor(e: Evidence): string {
  switch (e.type) {
    case 'photo': return 'jpg';
    case 'video': return 'mp4';
    case 'evp': return 'm4a';
    default: return 'bin';
  }
}

function isoStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
