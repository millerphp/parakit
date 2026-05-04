import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  cloudDownloadOutline,
  createOutline,
  playCircleOutline,
  shareSocialOutline,
  trashOutline
} from 'ionicons/icons';
import { Location } from '@angular/common';
import { PhotoLightboxComponent } from '../components/photo-lightbox/photo-lightbox.component';
import { DownloadsService } from '../services/downloads.service';
import { MediaService } from '../services/media.service';
import { ShareService } from '../services/share.service';
import { formatDateTime, formatHms } from '../shared/formatters';
import { goBackOr } from '../shared/navigation';
import { ToastController } from '../shared/toast.controller';
import { Evidence, EvpEvidence, InvestigationRecord, InvestigationStore, PhotoEvidence, VideoEvidence } from '../investigation.store';

@Component({
  selector: 'app-investigation-detail-page',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon, PhotoLightboxComponent],
  styleUrl: './investigation-detail.page.css',
  template: `
    <ion-content fullscreen="true" class="detail">
      <div class="frame">
        <header class="page-header">
          <button type="button" class="back-button" (click)="goBack()">
            <ion-icon name="arrow-back-outline"></ion-icon>
            <span>Back</span>
          </button>

          @if (record(); as r) {
            <div class="header-copy">
              <p class="eyebrow">{{ startedLabel(r) }}</p>
              <h1>{{ r.locationTitle?.trim() || 'Untitled investigation' }}</h1>
              <span class="status-chip" [class.status-chip--active]="r.status === 'active'">
                {{ r.status === 'active' ? 'Active' : 'Stopped' }}
              </span>
            </div>
          } @else {
            <div class="header-copy">
              <p class="eyebrow">Archive</p>
              <h1>Investigation</h1>
            </div>
          }
        </header>

        @if (record(); as r) {
          <section class="section">
            <div class="record-actions">
              @if (canResume(r)) {
                <ion-button fill="solid" size="small" color="primary" (click)="resume(r.id)">
                  <ion-icon slot="start" name="play-circle-outline"></ion-icon>
                  Resume
                </ion-button>
              }
              <ion-button fill="outline" size="small" color="light" (click)="edit(r.id)">
                <ion-icon slot="start" name="create-outline"></ion-icon>
                Edit
              </ion-button>
              <ion-button fill="outline" size="small" color="light" (click)="shareInvestigation(r)">
                <ion-icon slot="start" name="share-social-outline"></ion-icon>
                Share
              </ion-button>
              <ion-button fill="outline" size="small" color="light" (click)="downloadInvestigation(r)" [disabled]="downloading()">
                <ion-icon slot="start" name="cloud-download-outline"></ion-icon>
                {{ downloading() ? 'Saving...' : 'Download' }}
              </ion-button>
              <ion-button fill="outline" size="small" color="danger" (click)="confirmDelete(r)">
                <ion-icon slot="start" name="trash-outline"></ion-icon>
                Delete
              </ion-button>
            </div>
          </section>

          <section class="section">
            <h2>Brief</h2>
            <div class="kv">
              <div class="kv__row">
                <div class="kv__key">Started</div>
                <div class="kv__value">{{ formatDateTime(r.startedAt) }}</div>
              </div>
              @if (r.stoppedAt) {
                <div class="kv__row">
                  <div class="kv__key">Stopped</div>
                  <div class="kv__value">{{ formatDateTime(r.stoppedAt) }}</div>
                </div>
                <div class="kv__row">
                  <div class="kv__key">Duration</div>
                  <div class="kv__value">{{ duration(r) }}</div>
                </div>
              }
            </div>
          </section>

          @if (r.investigationReason?.trim()) {
            <section class="section">
              <h2>Investigation reason</h2>
              <p class="prose">{{ r.investigationReason }}</p>
            </section>
          }

          <section class="section">
            <h2>Environment</h2>
            <div class="kv">
              <div class="kv__row">
                <div class="kv__key">GPS</div>
                <div class="kv__value">{{ formatGps(r) }}</div>
              </div>
              <div class="kv__row">
                <div class="kv__key">Altitude</div>
                <div class="kv__value">{{ formatAltitude(r) }}</div>
              </div>
              <div class="kv__row">
                <div class="kv__key">Weather</div>
                <div class="kv__value">{{ r.weather.weatherLabel || 'Unavailable' }}</div>
              </div>
              <div class="kv__row">
                <div class="kv__key">Conditions</div>
                <div class="kv__value">{{ formatWeather(r) }}</div>
              </div>
              <div class="kv__row">
                <div class="kv__key">Moon</div>
                <div class="kv__value">{{ formatMoon(r) }}</div>
              </div>
            </div>
          </section>

          <section class="section">
            <h2>Field notes</h2>
            @if (r.notes?.trim()) {
              <p class="prose">{{ r.notes }}</p>
            } @else {
              <p class="empty">No field notes were recorded.</p>
            }
          </section>

          <section class="section">
            <h2>Evidence log</h2>
            @if (r.evidence?.length) {
              <div class="evidence-list">
                @for (entry of r.evidence; track entry.id) {
                  <div class="evidence-row">
                    <div class="evidence-row__time">{{ formatDateTime(entry.capturedAt) }}</div>
                    <div class="evidence-row__body">
                      {{ formatEvidence(entry) }}
                      @if (isEvp(entry)) {
                        <audio controls class="evidence-media evidence-media--audio" [src]="audioUrl(entry)"></audio>
                      }
                      @if (isPhoto(entry)) {
                        <img
                          [src]="photoUrl(entry)"
                          alt="Photo evidence (tap to view full size)"
                          class="evidence-media evidence-media--photo"
                          (click)="openLightbox(photoUrl(entry))"
                        />
                      }
                      @if (isVideo(entry)) {
                        <video
                          controls
                          preload="metadata"
                          class="evidence-media evidence-media--video"
                          [src]="videoUrl(entry)"
                        ></video>
                      }
                    </div>
                    <div class="evidence-row__actions">
                      <button type="button" class="icon-btn" (click)="shareEvidence(r, entry)" aria-label="Share evidence">
                        <ion-icon name="share-social-outline"></ion-icon>
                      </button>
                      <button type="button" class="icon-btn" (click)="downloadEvidence(r, entry)" aria-label="Download evidence">
                        <ion-icon name="cloud-download-outline"></ion-icon>
                      </button>
                      <button type="button" class="icon-btn icon-btn--danger" (click)="confirmDeleteEvidence(r, entry)" aria-label="Delete evidence">
                        <ion-icon name="trash-outline"></ion-icon>
                      </button>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <!-- TODO: extend this list as EVP/Photograph/Video/Geophone/Barometer capture is wired in. -->
              <p class="empty">No evidence captured yet. Open an evidence tool from the home screen during this session to log readings here.</p>
            }
          </section>
        } @else {
          <div class="not-found">
            <p>Investigation not found.</p>
          </div>
        }

        @if (lightboxSrc(); as src) {
          <app-photo-lightbox [src]="src" (close)="closeLightbox()"></app-photo-lightbox>
        }

      </div>
    </ion-content>
  `
})
export class InvestigationDetailPage {
  private readonly store = inject(InvestigationStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly shareSvc = inject(ShareService);
  private readonly mediaSvc = inject(MediaService);
  private readonly downloadsSvc = inject(DownloadsService);
  private readonly toastSvc = inject(ToastController);

  protected readonly lightboxSrc = signal<string | null>(null);
  protected readonly downloading = signal<boolean>(false);

  protected readonly record = computed<InvestigationRecord | null>(() => {
    // Re-read whenever history changes so the active investigation reflects status updates.
    const history = this.store.history();
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      return null;
    }
    return history.find((r) => r.id === id) ?? null;
  });

  constructor() {
    addIcons({ arrowBackOutline, cloudDownloadOutline, createOutline, playCircleOutline, shareSocialOutline, trashOutline });
  }

  canResume(record: InvestigationRecord): boolean {
    if (record.status !== 'stopped' || !record.stoppedAt) return false;
    if (this.store.activeInvestigation() !== null) return false;
    const ageMs = Date.now() - new Date(record.stoppedAt).getTime();
    return ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;
  }

  resume(id: string): void {
    const result = this.store.resumeInvestigation(id);
    if (result.record) {
      this.toastSvc.show('Investigation resumed');
    } else if (result.reason === 'already-active') {
      this.toastSvc.show('Stop the active investigation first.');
    } else {
      this.toastSvc.show('Could not resume.');
    }
  }

  edit(id: string): void {
    void this.router.navigateByUrl(`/investigation/${id}/edit`);
  }

  async shareInvestigation(record: InvestigationRecord): Promise<void> {
    try {
      await this.shareSvc.shareInvestigation(record);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Share failed.';
      this.toastSvc.show(`Share failed: ${message}`);
    }
  }

  async shareEvidence(record: InvestigationRecord, evidence: Evidence): Promise<void> {
    try {
      await this.shareSvc.shareEvidence(record, evidence);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Share failed.';
      this.toastSvc.show(`Share failed: ${message}`);
    }
  }

  async downloadInvestigation(record: InvestigationRecord): Promise<void> {
    if (this.downloading()) return;
    this.downloading.set(true);
    try {
      const result = await this.downloadsSvc.downloadInvestigation(record);
      if (result.saved) {
        this.toastSvc.show(`Saved ${result.fileName} (${result.fileCount} file${result.fileCount === 1 ? '' : 's'} in zip)`);
      } else {
        this.toastSvc.show('Download cancelled');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed.';
      this.toastSvc.show(`Download failed: ${message}`);
    } finally {
      this.downloading.set(false);
    }
  }

  async downloadEvidence(record: InvestigationRecord, evidence: Evidence): Promise<void> {
    try {
      const result = await this.downloadsSvc.downloadEvidence(record, evidence);
      if (result.saved) {
        this.toastSvc.show(`Saved ${result.fileName}`);
      } else {
        this.toastSvc.show('Download cancelled');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed.';
      this.toastSvc.show(`Download failed: ${message}`);
    }
  }

  async confirmDelete(record: InvestigationRecord): Promise<void> {
    const ok = window.confirm(
      `Delete "${record.locationTitle?.trim() || 'this investigation'}"? All evidence files will be removed. This cannot be undone.`
    );
    if (!ok) return;

    await this.mediaSvc.deleteAllEvidenceFiles(record.evidence ?? []);
    this.store.deleteInvestigation(record.id);
    void this.router.navigateByUrl('/investigation-history');
  }

  async confirmDeleteEvidence(record: InvestigationRecord, evidence: Evidence): Promise<void> {
    const label = this.formatEvidence(evidence);
    const ok = window.confirm(`Delete this evidence?\n\n${label}\n\nThis cannot be undone.`);
    if (!ok) return;

    await this.mediaSvc.deleteEvidenceFile(evidence);
    this.store.removeEvidence(record.id, evidence.id);
  }

  goBack(): void {
    goBackOr(this.location, this.router, '/investigation-history');
  }

  startedLabel(record: InvestigationRecord): string {
    return new Date(record.startedAt).toLocaleDateString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  protected readonly formatDateTime = formatDateTime;

  duration(record: InvestigationRecord): string {
    if (!record.stoppedAt) {
      return '—';
    }
    return formatHms(new Date(record.stoppedAt).getTime() - new Date(record.startedAt).getTime());
  }

  formatGps(record: InvestigationRecord): string {
    const { latitude, longitude, accuracyMeters } = record.location;
    const base = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    return accuracyMeters !== null ? `${base} · ±${Math.round(accuracyMeters)} m` : base;
  }

  formatAltitude(record: InvestigationRecord): string {
    return record.location.altitudeMeters !== null
      ? `${Math.round(record.location.altitudeMeters)} m`
      : 'Unavailable';
  }

  formatWeather(record: InvestigationRecord): string {
    const w = record.weather;
    const parts = [
      w.temperatureC !== null ? `${w.temperatureC.toFixed(1)} °C` : null,
      w.humidityPct !== null ? `Humidity ${w.humidityPct}%` : null,
      w.windSpeedKph !== null ? `Wind ${Math.round(w.windSpeedKph)} kph` : null
    ].filter((part): part is string => Boolean(part));
    return parts.length ? parts.join(' · ') : 'Unavailable';
  }

  formatMoon(record: InvestigationRecord): string {
    const m = record.moon;
    return `${m.phaseName} · ${m.illuminationPct}% lit · age ${m.ageDays}d`;
  }

  formatEvidence(entry: Evidence): string {
    if (entry.type === 'emf') {
      return `EMF · bin ${entry.bin} · ${entry.magnitudeMicroT.toFixed(1)} μT (Δ ${entry.deviationMicroT.toFixed(1)})`;
    }
    if (entry.type === 'vibration') {
      return `Vibration · bin ${entry.bin} · ${entry.magnitudeMs2.toFixed(2)} m/s² (peak ${entry.peakSinceCalibrationMs2.toFixed(2)})`;
    }
    if (entry.type === 'field-note') {
      return `Note · ${entry.text}`;
    }
    if (entry.type === 'evp') {
      const sec = Math.max(0, Math.round(entry.durationMs / 1000));
      const mm = Math.floor(sec / 60);
      const ss = (sec % 60).toString().padStart(2, '0');
      return `Sound · ${mm}:${ss}`;
    }
    if (entry.type === 'photo') {
      const kb = entry.sizeBytes / 1024;
      const size = kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
      return `Photo · ${size}`;
    }
    if (entry.type === 'video') {
      const sec = Math.max(0, Math.round(entry.durationMs / 1000));
      const mm = Math.floor(sec / 60);
      const ss = (sec % 60).toString().padStart(2, '0');
      const kb = entry.sizeBytes / 1024;
      const size = kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
      return `Video · ${mm}:${ss} · ${size}`;
    }
    return 'Evidence';
  }

  isEvp(entry: Evidence): entry is EvpEvidence {
    return entry.type === 'evp';
  }

  isPhoto(entry: Evidence): entry is PhotoEvidence {
    return entry.type === 'photo';
  }

  isVideo(entry: Evidence): entry is VideoEvidence {
    return entry.type === 'video';
  }

  audioUrl(entry: EvpEvidence): string {
    return Capacitor.convertFileSrc(entry.filePath);
  }

  photoUrl(entry: PhotoEvidence): string {
    return Capacitor.convertFileSrc(entry.filePath);
  }

  videoUrl(entry: VideoEvidence): string {
    return Capacitor.convertFileSrc(entry.filePath);
  }

  openLightbox(url: string): void {
    this.lightboxSrc.set(url);
  }

  closeLightbox(): void {
    this.lightboxSrc.set(null);
  }
}
