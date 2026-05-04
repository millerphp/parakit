import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  NgZone,
  computed,
  inject,
  signal
} from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  filmOutline,
  trashOutline,
  videocamOutline
} from 'ionicons/icons';
import { InvestigationStore, VideoEvidence } from '../investigation.store';
import { VideoService } from '../services/video.service';
import { createEvidenceId, formatDuration, formatTime } from '../shared/formatters';
import { ToastController } from '../shared/toast.controller';

@Component({
  selector: 'app-video-page',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon],
  styleUrl: './video.page.css',
  template: `
    <ion-content fullscreen="true" class="video">
      <div class="frame">
        <header class="page-header">
          <button type="button" class="back-button" (click)="goHome()">
            <ion-icon name="arrow-back-outline"></ion-icon>
            <span>Back</span>
          </button>
          <div class="header-copy">
            <p class="eyebrow">{{ activeTitle() }}</p>
            <h1>Video</h1>
          </div>
        </header>

        @if (errorMessage()) {
          <section class="section">
            <p class="notice notice--warn">{{ errorMessage() }}</p>
          </section>
        }

        @if (!hasActiveInvestigation()) {
          <section class="section">
            <p class="notice notice--warn">No active investigation — start one before recording video.</p>
          </section>
        }

        <section class="section capture">
          @if (lastSavedVideo(); as video) {
            <div class="preview">
              <video controls preload="metadata" [src]="videoUrl(video)"></video>
            </div>
            <p class="notice">Saved · {{ formatDuration(video.durationMs) }} · {{ videoSizeDisplay(video) }}. Recordings auto-save to evidence.</p>
            <div class="actions">
              <ion-button fill="outline" color="light" (click)="discardLast()">
                <ion-icon slot="start" name="trash-outline"></ion-icon>
                Discard last
              </ion-button>
              <ion-button color="primary" (click)="captureVideo()" [disabled]="capturing() || !hasActiveInvestigation()">
                <ion-icon slot="start" name="videocam-outline"></ion-icon>
                Record another
              </ion-button>
            </div>
          } @else {
            <button
              type="button"
              class="capture-btn"
              (click)="captureVideo()"
              [disabled]="capturing() || !hasActiveInvestigation()"
            >
              <ion-icon name="videocam-outline"></ion-icon>
              <span>{{ capturing() ? 'Opening...' : 'Record video' }}</span>
            </button>
            <p class="notice">Recordings auto-save to the active investigation as evidence.</p>
          }

        </section>

        <section class="section">
          <div class="section__label">
            <ion-icon name="film-outline"></ion-icon>
            This session ({{ entries().length }})
          </div>
          @if (entries().length === 0) {
            <p class="empty">No recordings yet.</p>
          } @else {
            @for (entry of entries(); track entry.id) {
              <article class="entry">
                <div class="entry__meta">
                  <span>{{ formatTime(entry.capturedAt) }}</span>
                  <span>{{ formatDuration(entry.durationMs) }} · {{ videoSizeDisplay(entry) }}</span>
                </div>
                <video controls preload="metadata" [src]="videoUrl(entry)"></video>
              </article>
            }
          }
        </section>
      </div>
    </ion-content>
  `
})
export class VideoPage {
  private readonly router = inject(Router);
  private readonly videoSvc = inject(VideoService);
  private readonly store = inject(InvestigationStore);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toastSvc = inject(ToastController);

  protected readonly errorMessage = signal<string>('');
  protected readonly capturing = signal<boolean>(false);
  private readonly lastSavedIdSig = signal<string | null>(null);

  protected readonly formatTime = formatTime;
  protected readonly formatDuration = formatDuration;

  protected readonly hasActiveInvestigation = computed(
    () => this.store.activeInvestigation() !== null
  );

  protected readonly activeTitle = computed(() => {
    const active = this.store.activeInvestigation();
    return active?.locationTitle?.trim() || 'Active investigation';
  });

  protected readonly entries = computed<VideoEvidence[]>(() => {
    const active = this.store.activeInvestigation();
    if (!active) return [];
    return (active.evidence ?? [])
      .filter((e): e is VideoEvidence => e.type === 'video')
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  });

  protected readonly lastSavedVideo = computed<VideoEvidence | null>(() => {
    const id = this.lastSavedIdSig();
    if (!id) return null;
    return this.entries().find((e) => e.id === id) ?? null;
  });

  constructor() {
    addIcons({ arrowBackOutline, filmOutline, trashOutline, videocamOutline });
  }

  async captureVideo(): Promise<void> {
    if (this.capturing()) return;
    if (!this.hasActiveInvestigation()) return;

    this.errorMessage.set('');
    this.capturing.set(true);

    try {
      const result = await this.videoSvc.capture();
      if (result.cancelled || !result.path) {
        return;
      }

      const evidence: VideoEvidence = {
        id: createEvidenceId(),
        type: 'video',
        capturedAt: new Date().toISOString(),
        filePath: result.path,
        durationMs: result.durationMs ?? 0,
        sizeBytes: result.size ?? 0
      };

      this.zone.run(() => {
        this.store.appendEvidenceToActive(evidence);
        this.lastSavedIdSig.set(evidence.id);
        this.cdr.markForCheck();
      });

      this.toastSvc.show(`Saved ${this.formatDuration(evidence.durationMs)} video`);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to capture video.');
    } finally {
      this.zone.run(() => {
        this.capturing.set(false);
        this.cdr.markForCheck();
      });
    }
  }

  async discardLast(): Promise<void> {
    const video = this.lastSavedVideo();
    if (!video) return;

    this.store.removeEvidenceFromActive(video.id);
    try { await this.videoSvc.deleteFile(video.filePath); } catch { /* ignore */ }
    this.lastSavedIdSig.set(null);
    this.toastSvc.show('Video discarded');
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }

  videoUrl(entry: VideoEvidence): string {
    return Capacitor.convertFileSrc(entry.filePath);
  }

  videoSizeDisplay(entry: VideoEvidence): string {
    const kb = entry.sizeBytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

}
