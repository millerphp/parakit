import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
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
  bookmarkOutline,
  micOutline,
  stopCircle,
  timeOutline,
  trashOutline
} from 'ionicons/icons';
import { EvpEvidence, InvestigationStore } from '../investigation.store';
import { VoiceRecorderService } from '../services/voice-recorder.service';
import { createEvidenceId, formatDuration, formatTime } from '../shared/formatters';
import { ToastController } from '../shared/toast.controller';

type RecorderState = 'idle' | 'recording' | 'reviewing';

@Component({
  selector: 'app-evp-page',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon],
  styleUrl: './evp.page.css',
  template: `
    <ion-content fullscreen="true" class="evp">
      <div class="frame">
        <header class="page-header">
          <button type="button" class="back-button" (click)="goHome()">
            <ion-icon name="arrow-back-outline"></ion-icon>
            <span>Back</span>
          </button>
          <div class="header-copy">
            <p class="eyebrow">{{ activeTitle() }}</p>
            <h1>Sound</h1>
          </div>
        </header>

        @if (errorMessage()) {
          <section class="section">
            <p class="notice notice--warn">{{ errorMessage() }}</p>
          </section>
        }

        @if (!hasActiveInvestigation()) {
          <section class="section">
            <p class="notice notice--warn">No active investigation — start one before recording EVP.</p>
          </section>
        }

        <section class="section recorder">
          @switch (recorderState()) {
            @case ('idle') {
              <button
                type="button"
                class="record-btn"
                (click)="startRecording()"
                [disabled]="!hasActiveInvestigation()"
              >
                <ion-icon name="mic-outline"></ion-icon>
                <span>Tap to record</span>
              </button>
              <p class="notice">Capture audio for analysis. Hold the phone still and listen for anomalies on playback.</p>
            }
            @case ('recording') {
              <button type="button" class="record-btn record-btn--active" (click)="stopRecording()">
                <ion-icon name="stop-circle"></ion-icon>
                <span class="duration">{{ liveDurationDisplay() }}</span>
              </button>
              <p class="notice">Recording... tap to stop.</p>
            }
            @case ('reviewing') {
              @if (pendingUrl(); as url) {
                <audio controls [src]="url"></audio>
              }
              <p class="notice">Saved · {{ pendingDurationDisplay() }} · {{ pendingSizeDisplay() }}</p>
              <div class="actions">
                <ion-button fill="outline" color="light" (click)="discardRecording()">
                  <ion-icon slot="start" name="trash-outline"></ion-icon>
                  Discard
                </ion-button>
                <ion-button color="primary" (click)="doneReviewing()">
                  <ion-icon slot="start" name="bookmark-outline"></ion-icon>
                  Done
                </ion-button>
              </div>
            }
          }

        </section>

        <section class="section">
          <div class="section__label">
            <ion-icon name="time-outline"></ion-icon>
            This session ({{ entries().length }})
          </div>
          @if (entries().length === 0) {
            <p class="empty">No recordings saved yet.</p>
          } @else {
            @for (entry of entries(); track entry.id) {
              <article class="entry">
                <div class="entry__meta">
                  <span>{{ formatTime(entry.capturedAt) }}</span>
                  <span>{{ formatDuration(entry.durationMs) }}</span>
                </div>
                <audio controls [src]="entryUrl(entry)"></audio>
              </article>
            }
          }
        </section>
      </div>
    </ion-content>
  `
})
export class EvpPage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly recorder = inject(VoiceRecorderService);
  private readonly store = inject(InvestigationStore);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toastSvc = inject(ToastController);

  protected readonly recorderState = signal<RecorderState>('idle');
  protected readonly errorMessage = signal<string>('');
  private readonly liveDurationMs = signal<number>(0);
  private readonly lastSavedIdSig = signal<string | null>(null);

  private liveTimer: number | null = null;
  // Monotonic — performance.now() is immune to wall-clock changes during recording.
  private liveStartMonotonic = 0;
  private recordingForInvestigationId: string | null = null;
  private destroyed = false;

  protected readonly hasActiveInvestigation = computed(
    () => this.store.activeInvestigation() !== null
  );

  protected readonly activeTitle = computed(() => {
    const active = this.store.activeInvestigation();
    return active?.locationTitle?.trim() || 'Active investigation';
  });

  protected readonly entries = computed<EvpEvidence[]>(() => {
    const active = this.store.activeInvestigation();
    if (!active) return [];
    return (active.evidence ?? [])
      .filter((e): e is EvpEvidence => e.type === 'evp')
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  });

  protected readonly liveDurationDisplay = computed(() => this.formatDuration(this.liveDurationMs()));

  protected readonly lastSavedEvidence = computed<EvpEvidence | null>(() => {
    const id = this.lastSavedIdSig();
    if (!id) return null;
    return this.entries().find((e) => e.id === id) ?? null;
  });

  protected readonly pendingUrl = computed(() => {
    const p = this.lastSavedEvidence();
    return p ? Capacitor.convertFileSrc(p.filePath) : '';
  });

  protected readonly pendingDurationDisplay = computed(() => {
    const p = this.lastSavedEvidence();
    return p ? this.formatDuration(p.durationMs) : '0:00';
  });

  protected readonly pendingSizeDisplay = computed(() => {
    const p = this.lastSavedEvidence();
    if (!p) return '';
    const kb = p.sizeBytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  });

  constructor() {
    addIcons({ arrowBackOutline, bookmarkOutline, micOutline, stopCircle, timeOutline, trashOutline });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.liveTimer !== null) window.clearInterval(this.liveTimer);
    // If the user navigates away mid-recording, drop the buffer.
    // Saved evidence in reviewing state stays — that's the auto-save guarantee.
    if (this.recorderState() === 'recording') {
      void this.recorder.cancel().catch(() => undefined);
    }
  }

  async startRecording(): Promise<void> {
    this.errorMessage.set('');
    const active = this.store.activeInvestigation();
    if (!active) return;

    try {
      const granted = await this.recorder.ensurePermission();
      if (!granted) {
        this.errorMessage.set('Microphone permission denied. Grant it in Settings → Apps → ParaKit: Investigation Toolkit → Permissions.');
        return;
      }
      await this.recorder.start();
      this.liveStartMonotonic = performance.now();
      // Pin the recording to the investigation that was active *now*, so a
      // mid-recording stop/start of investigations doesn't orphan the file.
      this.recordingForInvestigationId = active.id;
      this.liveDurationMs.set(0);
      this.recorderState.set('recording');
      this.startLiveTicker();
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to start recording.');
    }
  }

  async stopRecording(): Promise<void> {
    this.stopLiveTicker();
    const targetInvestigationId = this.recordingForInvestigationId;
    this.recordingForInvestigationId = null;

    try {
      const result = await this.recorder.stop();

      const evidence: EvpEvidence = {
        id: createEvidenceId(),
        type: 'evp',
        capturedAt: new Date().toISOString(),
        filePath: result.path,
        durationMs: result.durationMs,
        sizeBytes: result.size
      };

      // Always attempt to attach to the investigation that was active when
      // recording began — even if the page is being torn down or the user
      // has since stopped that investigation. The store's history is the
      // source of truth; if the investigation is gone, clean up the file.
      const attached = targetInvestigationId
        ? this.store.appendEvidenceTo(targetInvestigationId, evidence)
        : null;

      if (!attached) {
        try { await this.recorder.deleteFile(result.path); } catch { /* ignore */ }
        if (!this.destroyed) {
          this.zone.run(() => {
            this.recorderState.set('idle');
            this.errorMessage.set(
              targetInvestigationId
                ? 'The investigation this recording belonged to is gone — recording discarded.'
                : 'No active investigation — recording discarded.'
            );
            this.cdr.markForCheck();
          });
        }
        return;
      }

      // Saved successfully. UI updates only if we're still mounted.
      if (this.destroyed) return;
      this.zone.run(() => {
        this.lastSavedIdSig.set(evidence.id);
        this.recorderState.set('reviewing');
        this.cdr.markForCheck();
      });
      this.toastSvc.show(`Saved ${this.formatDuration(evidence.durationMs)} recording`);
    } catch (err) {
      if (this.destroyed) return;
      this.zone.run(() => {
        this.errorMessage.set(err instanceof Error ? err.message : 'Failed to stop recording.');
        this.recorderState.set('idle');
        this.cdr.markForCheck();
      });
    }
  }

  async discardRecording(): Promise<void> {
    const evidence = this.lastSavedEvidence();
    if (evidence) {
      this.store.removeEvidenceFromActive(evidence.id);
      try { await this.recorder.deleteFile(evidence.filePath); } catch { /* ignore */ }
    }
    this.lastSavedIdSig.set(null);
    this.recorderState.set('idle');
    this.toastSvc.show('Recording discarded');
  }

  doneReviewing(): void {
    this.lastSavedIdSig.set(null);
    this.recorderState.set('idle');
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }

  entryUrl(entry: EvpEvidence): string {
    return Capacitor.convertFileSrc(entry.filePath);
  }

  protected readonly formatTime = formatTime;
  protected readonly formatDuration = formatDuration;

  private startLiveTicker(): void {
    this.stopLiveTicker();
    const tick = () => {
      this.zone.run(() => {
        this.liveDurationMs.set(performance.now() - this.liveStartMonotonic);
        this.cdr.markForCheck();
      });
    };
    tick();
    this.liveTimer = window.setInterval(tick, 250);
  }

  private stopLiveTicker(): void {
    if (this.liveTimer !== null) {
      window.clearInterval(this.liveTimer);
      this.liveTimer = null;
    }
  }

}
