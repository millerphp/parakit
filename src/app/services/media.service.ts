import { Injectable, inject } from '@angular/core';
import { Evidence } from '../investigation.store';
import { PhotoService } from './photo.service';
import { VideoService } from './video.service';
import { VoiceRecorderService } from './voice-recorder.service';

/**
 * One-stop media file lifecycle helper. Pages don't need to know which
 * underlying plugin owns which evidence type — they just hand us an evidence
 * record and we route to the right `deleteFile` call.
 */
@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly photoSvc = inject(PhotoService);
  private readonly videoSvc = inject(VideoService);
  private readonly recorderSvc = inject(VoiceRecorderService);

  /**
   * Delete the on-disk file for a single piece of evidence, if any. Non-media
   * evidence types (EMF/Vibration/Field Note) resolve immediately — they have
   * no file to clean up. Errors are swallowed silently because evidence-row
   * removal from the store should proceed regardless of file-delete success.
   */
  async deleteEvidenceFile(evidence: Evidence): Promise<void> {
    try {
      switch (evidence.type) {
        case 'photo':
          await this.photoSvc.deleteFile(evidence.filePath);
          return;
        case 'video':
          await this.videoSvc.deleteFile(evidence.filePath);
          return;
        case 'evp':
          await this.recorderSvc.deleteFile(evidence.filePath);
          return;
        default:
          return;
      }
    } catch {
      /* file delete failures are non-fatal */
    }
  }

  /** Parallel-delete every media file owned by an investigation. */
  async deleteAllEvidenceFiles(items: readonly Evidence[]): Promise<void> {
    await Promise.allSettled(items.map((e) => this.deleteEvidenceFile(e)));
  }
}
