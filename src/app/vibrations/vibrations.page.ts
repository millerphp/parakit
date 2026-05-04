import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, bookmarkOutline, refreshOutline } from 'ionicons/icons';
import { InvestigationStore, VibrationEvidence } from '../investigation.store';
import { VibrationReading, VibrationsService, vibrationBinFor } from '../services/vibrations.service';
import { createEvidenceId } from '../shared/formatters';
import { ToastController } from '../shared/toast.controller';

interface SpikeState {
  reading: VibrationReading;
  magnitude: number;
  bin: number;
}

const SEGMENTS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

@Component({
  selector: 'app-vibrations-page',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon],
  styleUrl: './vibrations.page.css',
  template: `
    <ion-content fullscreen="true" class="vibrations">
      <div class="frame">
        <header class="page-header">
          <button type="button" class="back-button" (click)="goHome()">
            <ion-icon name="arrow-back-outline"></ion-icon>
            <span>Back</span>
          </button>
          <div class="header-copy">
            <p class="eyebrow">Linear acceleration · {{ stateLabel() }}</p>
            <h1>Vibrations</h1>
          </div>
        </header>

        @if (sensorState().kind === 'unsupported' || sensorState().kind === 'error') {
          <section class="section">
            <p class="notice notice--warn">{{ errorMessage() }}</p>
          </section>
        }

        <section class="section reading">
          <div class="reading__bin-label">{{ binLabel() }}</div>
          <div class="reading__magnitude">
            {{ magnitudeDisplay() }}<small>m/s²</small>
          </div>
          <div class="reading__deviation">
            Peak this session: {{ peakMagnitudeDisplay() }} m/s²
          </div>

          <div class="bar" role="meter" [attr.aria-valuenow]="bin()" aria-valuemin="0" aria-valuemax="7">
            <div class="bar__fill" [style.width.%]="(bin() / 7) * 100"></div>
            <div class="bar__markers">
              @for (seg of segments; track seg) {
                <span class="bar__marker">{{ seg }}</span>
              }
            </div>
          </div>

          <div class="debug-strip">
            mag {{ magnitudeDisplay() }} · peak {{ peakMagnitudeDisplay() }} · bin {{ bin() }} · tick {{ tickDisplay() }}
          </div>
        </section>

        <section class="section">
          <p class="notice">Place the phone on a flat, stable surface. The bar tracks current motion; the peak sticks until you reset it.</p>

          <div class="kv">
            <div class="kv__row">
              <div class="kv__key">Peak (session)</div>
              <div class="kv__value">{{ peakDisplay() }}</div>
            </div>
            <div class="kv__row">
              <div class="kv__key">Components</div>
              <div class="kv__value">{{ componentsDisplay() }}</div>
            </div>
          </div>

          <div class="actions">
            <ion-button fill="outline" color="light" (click)="resetPeak()" [disabled]="!hasReading()">
              <ion-icon slot="start" name="refresh-outline"></ion-icon>
              Reset peak
            </ion-button>
            <ion-button color="primary" (click)="saveSnapshot()" [disabled]="!hasReading() || !hasActiveInvestigation()">
              <ion-icon slot="start" name="bookmark-outline"></ion-icon>
              Save snapshot
            </ion-button>
          </div>


          @if (hasActiveInvestigation()) {
            <p class="notice" style="margin-top:12px;">Auto-save: spikes at bin ≥ {{ autoSaveThreshold }} (saved {{ autoSaveCount() }} this session).</p>
          } @else {
            <p class="notice" style="margin-top:12px;">No active investigation — readings won't be saved.</p>
          }
        </section>
      </div>
    </ion-content>
  `
})
export class VibrationsPage implements OnDestroy {
  protected readonly segments = SEGMENTS;

  private readonly router = inject(Router);
  private readonly vibrations = inject(VibrationsService);
  private readonly store = inject(InvestigationStore);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toastSvc = inject(ToastController);

  protected readonly sensorState = this.vibrations.state;
  protected readonly reading = this.vibrations.reading;

  private static readonly AUTO_SAVE_BIN_THRESHOLD = 4;
  private static readonly SPIKE_DEBOUNCE_TICKS = 10; // ~200ms at 50Hz

  private readonly peakSig = signal<number>(0);
  private readonly autoSaveCountSig = signal<number>(0);
  private currentSpike: SpikeState | null = null;
  private belowThresholdTicks = 0;

  protected readonly hasReading = computed(() => this.reading() !== null);
  protected readonly hasActiveInvestigation = computed(() => this.store.activeInvestigation() !== null);
  protected readonly autoSaveCount = this.autoSaveCountSig.asReadonly();
  protected readonly autoSaveThreshold = VibrationsPage.AUTO_SAVE_BIN_THRESHOLD;

  protected readonly bin = computed(() => {
    const r = this.reading();
    return r ? vibrationBinFor(r.magnitude) : 0;
  });

  protected readonly stateLabel = computed(() => {
    const s = this.sensorState();
    switch (s.kind) {
      case 'idle': return 'idle';
      case 'starting': return 'starting...';
      case 'running': return 'live';
      case 'unsupported': return 'unsupported';
      case 'error': return 'error';
    }
  });

  protected readonly errorMessage = computed(() => {
    const s = this.sensorState();
    if (s.kind === 'unsupported' || s.kind === 'error') {
      return s.reason;
    }
    return '';
  });

  protected readonly magnitudeDisplay = computed(() => {
    const r = this.reading();
    return r ? r.magnitude.toFixed(2) : '—';
  });

  protected readonly peakMagnitudeDisplay = computed(() => this.peakSig().toFixed(2));

  protected readonly peakDisplay = computed(() => {
    const peak = this.peakSig();
    if (peak === 0) return '—';
    return `bin ${vibrationBinFor(peak)} (${peak.toFixed(2)} m/s²)`;
  });

  protected readonly componentsDisplay = computed(() => {
    const r = this.reading();
    if (!r) return '—';
    return `x ${r.x.toFixed(2)} · y ${r.y.toFixed(2)} · z ${r.z.toFixed(2)}`;
  });

  protected readonly tickDisplay = computed(() => {
    const r = this.reading();
    return r ? String(r.timestamp % 100000) : '—';
  });

  protected readonly binLabel = computed(() => {
    const b = this.bin();
    if (b === 0) return 'Still';
    if (b <= 2) return 'Light';
    if (b <= 4) return 'Moderate';
    if (b <= 6) return 'Strong';
    return 'Impact';
  });

  constructor() {
    addIcons({ arrowBackOutline, bookmarkOutline, refreshOutline });
    void this.vibrations.start();

    effect(() => {
      const r = this.reading();
      if (!r) return;
      untracked(() => {
        if (r.magnitude > this.peakSig()) {
          this.peakSig.set(r.magnitude);
        }

        const currentBin = vibrationBinFor(r.magnitude);

        // Spike detection for auto-save.
        if (currentBin >= VibrationsPage.AUTO_SAVE_BIN_THRESHOLD) {
          this.belowThresholdTicks = 0;
          if (!this.currentSpike || r.magnitude > this.currentSpike.magnitude) {
            this.currentSpike = { reading: r, magnitude: r.magnitude, bin: currentBin };
          }
        } else if (this.currentSpike) {
          this.belowThresholdTicks++;
          if (this.belowThresholdTicks >= VibrationsPage.SPIKE_DEBOUNCE_TICKS) {
            this.flushAutoSavedSpike();
            this.currentSpike = null;
            this.belowThresholdTicks = 0;
          }
        }
      });
    });
  }

  private flushAutoSavedSpike(): void {
    const spike = this.currentSpike;
    if (!spike) return;
    if (!this.hasActiveInvestigation()) return;

    const evidence: VibrationEvidence = {
      id: createEvidenceId(),
      type: 'vibration',
      capturedAt: new Date(spike.reading.timestamp).toISOString(),
      magnitudeMs2: spike.magnitude,
      peakSinceCalibrationMs2: this.peakSig(),
      bin: spike.bin,
      components: { x: spike.reading.x, y: spike.reading.y, z: spike.reading.z },
      note: 'auto-saved'
    };

    this.store.appendEvidenceToActive(evidence);
    this.autoSaveCountSig.update((n) => n + 1);
    this.toastSvc.show(`Auto-saved bin ${spike.bin} spike`);
  }

  ngOnDestroy(): void {
    void this.vibrations.stop();
  }

  resetPeak(): void {
    this.peakSig.set(0);
    this.toastSvc.show('Peak reset');
  }

  saveSnapshot(): void {
    const r = this.reading();
    if (!r) return;
    if (!this.hasActiveInvestigation()) return;

    const evidence: VibrationEvidence = {
      id: createEvidenceId(),
      type: 'vibration',
      capturedAt: new Date(r.timestamp).toISOString(),
      magnitudeMs2: r.magnitude,
      peakSinceCalibrationMs2: this.peakSig(),
      bin: vibrationBinFor(r.magnitude),
      components: { x: r.x, y: r.y, z: r.z }
    };

    this.store.appendEvidenceToActive(evidence);
    this.toastSvc.show(`Saved bin ${evidence.bin} snapshot to active investigation`);
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }

}
