import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, bookmarkOutline, refreshOutline } from 'ionicons/icons';
import { EmfEvidence, InvestigationStore } from '../investigation.store';
import { EmfReading, EmfService, binFor } from '../services/emf.service';
import { createEvidenceId } from '../shared/formatters';
import { ToastController } from '../shared/toast.controller';

interface SpikeState {
  reading: EmfReading;
  baseline: number;
  deviation: number;
  bin: number;
}

const SEGMENTS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

@Component({
  selector: 'app-emf-page',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon],
  styleUrl: './emf.page.css',
  template: `
    <ion-content fullscreen="true" class="emf">
      <div class="frame">
        <header class="page-header">
          <button type="button" class="back-button" (click)="goHome()">
            <ion-icon name="arrow-back-outline"></ion-icon>
            <span>Back</span>
          </button>
          <div class="header-copy">
            <p class="eyebrow">Magnetometer · {{ stateLabel() }}</p>
            <h1>EMF</h1>
          </div>
        </header>

        @if (sensorState().kind === 'unsupported' || sensorState().kind === 'error') {
          <section class="section">
            <p class="notice notice--warn">{{ errorMessage() }}</p>
          </section>
        }

        @if (accuracyWarning()) {
          <section class="section">
            <p class="notice notice--warn">{{ accuracyWarning() }}</p>
          </section>
        }

        <section class="section reading">
          <div class="reading__bin-label">{{ binLabel() }}</div>
          <div class="reading__magnitude">
            {{ magnitudeDisplay() }}<small>μT</small>
          </div>
          <div class="reading__deviation">
            Δ {{ deviationDisplay() }} μT from baseline
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
            mag {{ magnitudeDisplay() }} · base {{ baselineDisplay() }} · Δ {{ deviationDisplay() }} · bin {{ bin() }} · tick {{ tickDisplay() }}
          </div>
        </section>

        <section class="section">
          <div class="kv">
            <div class="kv__row">
              <div class="kv__key">Baseline</div>
              <div class="kv__value">{{ baselineDisplay() }}</div>
            </div>
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
            <ion-button fill="outline" color="light" (click)="recalibrate()" [disabled]="!hasReading() || calibrating()">
              <ion-icon slot="start" name="refresh-outline"></ion-icon>
              {{ calibrating() ? 'Calibrating...' : 'Recalibrate' }}
            </ion-button>
            <ion-button color="primary" (click)="saveSnapshot()" [disabled]="!hasReading() || !hasActiveInvestigation() || calibrating()">
              <ion-icon slot="start" name="bookmark-outline"></ion-icon>
              Save snapshot
            </ion-button>
          </div>

          <div class="actions">
            <ion-button fill="clear" size="small" color="medium" (click)="resetPeak()">
              Reset peak
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
export class EmfPage implements OnDestroy {
  protected readonly segments = SEGMENTS;

  private readonly router = inject(Router);
  private readonly emf = inject(EmfService);
  private readonly store = inject(InvestigationStore);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toastSvc = inject(ToastController);

  protected readonly sensorState = this.emf.state;
  protected readonly reading = this.emf.reading;
  protected readonly accuracy = this.emf.accuracy;
  protected readonly accuracyWarning = computed(() => {
    const a = this.accuracy();
    if (a === null) return '';
    if (a <= 0) return 'Magnetometer accuracy is unreliable. Move the phone in a slow figure-8 pattern to recalibrate.';
    if (a === 1) return 'Magnetometer accuracy is low. Readings may drift — try a figure-8 calibration motion.';
    return '';
  });

  private static readonly CALIBRATION_WINDOW_MS = 1000;
  private static readonly AUTO_SAVE_BIN_THRESHOLD = 5;
  private static readonly SPIKE_DEBOUNCE_TICKS = 10; // ~200ms at 50Hz

  private readonly baselineSig = signal<number | null>(null);
  private readonly peakSig = signal<{ magnitude: number; bin: number } | null>(null);
  private readonly calibratingSig = signal<boolean>(false);
  private readonly autoSaveCountSig = signal<number>(0);
  private calibrationSamples: number[] = [];
  private calibrationTimer: number | null = null;
  private currentSpike: SpikeState | null = null;
  private belowThresholdTicks = 0;

  protected readonly hasReading = computed(() => this.reading() !== null);
  protected readonly hasActiveInvestigation = computed(() => this.store.activeInvestigation() !== null);
  protected readonly calibrating = this.calibratingSig.asReadonly();
  protected readonly autoSaveCount = this.autoSaveCountSig.asReadonly();
  protected readonly autoSaveThreshold = EmfPage.AUTO_SAVE_BIN_THRESHOLD;

  protected readonly deviation = computed(() => {
    const r = this.reading();
    const baseline = this.baselineSig();
    if (!r || baseline === null) {
      return 0;
    }
    return Math.abs(r.magnitude - baseline);
  });

  protected readonly bin = computed(() => binFor(this.deviation()));

  protected readonly stateLabel = computed(() => {
    const s = this.sensorState();
    if (this.calibratingSig()) return 'calibrating...';
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
    return r ? r.magnitude.toFixed(1) : '—';
  });

  protected readonly deviationDisplay = computed(() => this.deviation().toFixed(1));

  protected readonly baselineDisplay = computed(() => {
    const b = this.baselineSig();
    return b === null ? 'Not set' : `${b.toFixed(1)} μT`;
  });

  protected readonly peakDisplay = computed(() => {
    const p = this.peakSig();
    return p === null ? '—' : `bin ${p.bin} (${p.magnitude.toFixed(1)} μT)`;
  });

  protected readonly componentsDisplay = computed(() => {
    const r = this.reading();
    if (!r) return '—';
    return `x ${r.x.toFixed(1)} · y ${r.y.toFixed(1)} · z ${r.z.toFixed(1)}`;
  });

  protected readonly tickDisplay = computed(() => {
    const r = this.reading();
    return r ? String(r.timestamp % 100000) : '—';
  });

  protected readonly binLabel = computed(() => {
    if (this.calibratingSig()) return 'Calibrating — hold the phone still';
    const b = this.bin();
    if (b === 0) return 'Quiet';
    if (b <= 2) return 'Low';
    if (b <= 4) return 'Moderate';
    if (b <= 6) return 'High';
    return 'Spike';
  });

  constructor() {
    addIcons({ arrowBackOutline, bookmarkOutline, refreshOutline });
    void this.emf.start();

    effect(() => {
      const r = this.reading();
      if (!r) return;

      untracked(() => {
        // Auto-calibrate the first time we see a reading.
        if (this.baselineSig() === null && !this.calibratingSig() && this.calibrationSamples.length === 0) {
          this.beginCalibration();
        }

        // While calibrating, accumulate samples; finalisation runs from the timer.
        if (this.calibratingSig()) {
          this.calibrationSamples.push(r.magnitude);
          return;
        }

        const baseline = this.baselineSig() ?? r.magnitude;
        const dev = Math.abs(r.magnitude - baseline);
        const currentBin = binFor(dev);

        // Session peak (sticky upward).
        const peak = this.peakSig();
        if (!peak || dev > peak.magnitude) {
          this.peakSig.set({ magnitude: dev, bin: currentBin });
        }

        // Spike detection for auto-save.
        if (currentBin >= EmfPage.AUTO_SAVE_BIN_THRESHOLD) {
          this.belowThresholdTicks = 0;
          if (!this.currentSpike || dev > this.currentSpike.deviation) {
            this.currentSpike = { reading: r, baseline, deviation: dev, bin: currentBin };
          }
        } else if (this.currentSpike) {
          this.belowThresholdTicks++;
          if (this.belowThresholdTicks >= EmfPage.SPIKE_DEBOUNCE_TICKS) {
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

    const evidence: EmfEvidence = {
      id: createEvidenceId(),
      type: 'emf',
      capturedAt: new Date(spike.reading.timestamp).toISOString(),
      magnitudeMicroT: spike.reading.magnitude,
      baselineMicroT: spike.baseline,
      deviationMicroT: spike.deviation,
      bin: spike.bin,
      components: { x: spike.reading.x, y: spike.reading.y, z: spike.reading.z },
      note: 'auto-saved'
    };

    this.store.appendEvidenceToActive(evidence);
    this.autoSaveCountSig.update((n) => n + 1);
    this.toastSvc.show(`Auto-saved bin ${evidence.bin} spike`);
  }

  ngOnDestroy(): void {
    void this.emf.stop();
    if (this.calibrationTimer !== null) {
      window.clearTimeout(this.calibrationTimer);
    }
  }

  recalibrate(): void {
    if (!this.hasReading()) return;
    this.beginCalibration();
  }

  resetPeak(): void {
    this.peakSig.set(null);
    this.toastSvc.show('Peak reset');
  }

  private beginCalibration(): void {
    if (this.calibrationTimer !== null) {
      window.clearTimeout(this.calibrationTimer);
    }
    this.calibrationSamples = [];
    this.peakSig.set(null);
    this.zone.run(() => {
      this.calibratingSig.set(true);
      this.cdr.markForCheck();
    });
    this.calibrationTimer = window.setTimeout(() => this.finishCalibration(), EmfPage.CALIBRATION_WINDOW_MS);
  }

  private finishCalibration(): void {
    this.calibrationTimer = null;
    const samples = this.calibrationSamples;
    if (samples.length === 0) {
      // Bail out — no samples received in the window. Try again on next reading.
      this.zone.run(() => {
        this.calibratingSig.set(false);
        this.cdr.markForCheck();
      });
      return;
    }
    const avg = samples.reduce((sum, v) => sum + v, 0) / samples.length;
    this.zone.run(() => {
      this.baselineSig.set(avg);
      this.calibratingSig.set(false);
      this.cdr.markForCheck();
    });
    this.toastSvc.show(`Baseline set: ${avg.toFixed(1)} μT (${samples.length} samples)`);
    this.calibrationSamples = [];
  }

  saveSnapshot(): void {
    const r = this.reading();
    if (!r) return;
    if (!this.hasActiveInvestigation()) return;

    const baseline = this.baselineSig() ?? r.magnitude;
    const deviation = Math.abs(r.magnitude - baseline);
    const evidence: EmfEvidence = {
      id: createEvidenceId(),
      type: 'emf',
      capturedAt: new Date(r.timestamp).toISOString(),
      magnitudeMicroT: r.magnitude,
      baselineMicroT: baseline,
      deviationMicroT: deviation,
      bin: binFor(deviation),
      components: { x: r.x, y: r.y, z: r.z }
    };

    this.store.appendEvidenceToActive(evidence);
    this.toastSvc.show(`Saved bin ${evidence.bin} snapshot to active investigation`);
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }

}
