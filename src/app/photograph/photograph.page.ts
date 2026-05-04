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
  cameraOutline,
  imagesOutline,
  trashOutline
} from 'ionicons/icons';
import { PhotoLightboxComponent } from '../components/photo-lightbox/photo-lightbox.component';
import { InvestigationStore, PhotoEvidence } from '../investigation.store';
import { PhotoService } from '../services/photo.service';
import { createEvidenceId, formatTime } from '../shared/formatters';
import { ToastController } from '../shared/toast.controller';

@Component({
  selector: 'app-photograph-page',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon, PhotoLightboxComponent],
  styleUrl: './photograph.page.css',
  template: `
    <ion-content fullscreen="true" class="photograph">
      <div class="frame">
        <header class="page-header">
          <button type="button" class="back-button" (click)="goHome()">
            <ion-icon name="arrow-back-outline"></ion-icon>
            <span>Back</span>
          </button>
          <div class="header-copy">
            <p class="eyebrow">{{ activeTitle() }}</p>
            <h1>Photograph</h1>
          </div>
        </header>

        @if (errorMessage()) {
          <section class="section">
            <p class="notice notice--warn">{{ errorMessage() }}</p>
          </section>
        }

        @if (!hasActiveInvestigation()) {
          <section class="section">
            <p class="notice notice--warn">No active investigation — start one before capturing photos.</p>
          </section>
        }

        <section class="section capture">
          @if (lastSavedPhoto(); as photo) {
            <div class="preview" (click)="openLightbox(photoUrl(photo))">
              <img [src]="photoUrl(photo)" alt="Most recent capture (tap to view full size)" />
            </div>
            <p class="notice">Saved · {{ photoSizeDisplay(photo) }}. Tap the image to view full size. Captures auto-save to evidence.</p>
            <div class="actions">
              <ion-button fill="outline" color="light" (click)="discardLast()">
                <ion-icon slot="start" name="trash-outline"></ion-icon>
                Discard last
              </ion-button>
              <ion-button color="primary" (click)="capturePhoto()" [disabled]="capturing() || !hasActiveInvestigation()">
                <ion-icon slot="start" name="camera-outline"></ion-icon>
                Take another
              </ion-button>
            </div>
          } @else {
            <button
              type="button"
              class="capture-btn"
              (click)="capturePhoto()"
              [disabled]="capturing() || !hasActiveInvestigation()"
            >
              <ion-icon name="camera-outline"></ion-icon>
              <span>{{ capturing() ? 'Opening...' : 'Take photo' }}</span>
            </button>
            <p class="notice">Captures auto-save to the active investigation as evidence.</p>
          }

        </section>

        <section class="section">
          <div class="section__label">
            <ion-icon name="images-outline"></ion-icon>
            This session ({{ entries().length }})
          </div>
          @if (entries().length === 0) {
            <p class="empty">No photos yet.</p>
          } @else {
            <div class="gallery">
              @for (entry of entries(); track entry.id) {
                <button type="button" class="gallery__item" (click)="openLightbox(photoUrl(entry))">
                  <img [src]="photoUrl(entry)" [alt]="'Captured ' + formatTime(entry.capturedAt) + ' — tap to view full size'" />
                  <div class="gallery__caption">{{ formatTime(entry.capturedAt) }}</div>
                </button>
              }
            </div>
          }
        </section>

        @if (lightboxSrc(); as src) {
          <app-photo-lightbox [src]="src" (close)="closeLightbox()"></app-photo-lightbox>
        }
      </div>
    </ion-content>
  `
})
export class PhotographPage {
  private readonly router = inject(Router);
  private readonly photoSvc = inject(PhotoService);
  private readonly store = inject(InvestigationStore);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toastSvc = inject(ToastController);

  protected readonly errorMessage = signal<string>('');
  protected readonly capturing = signal<boolean>(false);
  protected readonly lightboxSrc = signal<string | null>(null);
  private readonly lastSavedIdSig = signal<string | null>(null);

  protected readonly formatTime = formatTime;

  protected readonly hasActiveInvestigation = computed(
    () => this.store.activeInvestigation() !== null
  );

  protected readonly activeTitle = computed(() => {
    const active = this.store.activeInvestigation();
    return active?.locationTitle?.trim() || 'Active investigation';
  });

  protected readonly entries = computed<PhotoEvidence[]>(() => {
    const active = this.store.activeInvestigation();
    if (!active) return [];
    return (active.evidence ?? [])
      .filter((e): e is PhotoEvidence => e.type === 'photo')
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  });

  protected readonly lastSavedPhoto = computed<PhotoEvidence | null>(() => {
    const id = this.lastSavedIdSig();
    if (!id) return null;
    return this.entries().find((e) => e.id === id) ?? null;
  });

  constructor() {
    addIcons({ arrowBackOutline, cameraOutline, imagesOutline, trashOutline });
  }

  async capturePhoto(): Promise<void> {
    if (this.capturing()) return;
    if (!this.hasActiveInvestigation()) return;

    this.errorMessage.set('');
    this.capturing.set(true);

    try {
      const result = await this.photoSvc.capture();
      if (result.cancelled || !result.path) {
        return;
      }

      const evidence: PhotoEvidence = {
        id: createEvidenceId(),
        type: 'photo',
        capturedAt: new Date().toISOString(),
        filePath: result.path,
        sizeBytes: result.size ?? 0
      };

      this.zone.run(() => {
        this.store.appendEvidenceToActive(evidence);
        this.lastSavedIdSig.set(evidence.id);
        this.cdr.markForCheck();
      });

      this.toastSvc.show(`Saved ${this.photoSizeDisplay(evidence)} photo`);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to capture photo.');
    } finally {
      this.zone.run(() => {
        this.capturing.set(false);
        this.cdr.markForCheck();
      });
    }
  }

  async discardLast(): Promise<void> {
    const photo = this.lastSavedPhoto();
    if (!photo) return;

    this.store.removeEvidenceFromActive(photo.id);
    try { await this.photoSvc.deleteFile(photo.filePath); } catch { /* ignore */ }
    this.lastSavedIdSig.set(null);
    this.toastSvc.show('Photo discarded');
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }

  openLightbox(url: string): void {
    this.lightboxSrc.set(url);
  }

  closeLightbox(): void {
    this.lightboxSrc.set(null);
  }

  photoUrl(entry: PhotoEvidence): string {
    return Capacitor.convertFileSrc(entry.filePath);
  }

  photoSizeDisplay(entry: PhotoEvidence): string {
    const kb = entry.sizeBytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

}
