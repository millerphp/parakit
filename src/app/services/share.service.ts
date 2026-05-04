import { Injectable } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import { Evidence, InvestigationRecord } from '../investigation.store';
import { buildEvidenceMarkdown, buildInvestigationMarkdown } from './investigation-formatters';

interface SharePlugin {
  share(options: { text?: string; title?: string; dialogTitle?: string; files?: string[] }): Promise<void>;
}

const Share = registerPlugin<SharePlugin>('Share');

@Injectable({ providedIn: 'root' })
export class ShareService {
  async shareInvestigation(record: InvestigationRecord): Promise<void> {
    const text = buildInvestigationMarkdown(record);
    const files = collectFiles(record);
    await Share.share({
      text,
      title: record.locationTitle?.trim() || 'Paranormal investigation',
      dialogTitle: 'Share investigation',
      files
    });
  }

  async shareEvidence(record: InvestigationRecord, evidence: Evidence): Promise<void> {
    const text = buildEvidenceMarkdown(record, evidence);
    const files: string[] = [];
    if (evidence.type === 'photo' || evidence.type === 'video' || evidence.type === 'evp') {
      files.push(evidence.filePath);
    }
    await Share.share({
      text,
      title: `Evidence from ${record.locationTitle?.trim() || 'investigation'}`,
      dialogTitle: 'Share evidence',
      files
    });
  }
}

function collectFiles(record: InvestigationRecord): string[] {
  const files: string[] = [];
  for (const e of record.evidence ?? []) {
    if (e.type === 'photo' || e.type === 'video' || e.type === 'evp') {
      files.push(e.filePath);
    }
  }
  return files;
}
