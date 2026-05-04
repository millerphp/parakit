import { CommonModule, Location } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { archiveOutline, arrowBackOutline, cloudDownloadOutline, cloudUploadOutline, documentTextOutline } from 'ionicons/icons';
import { InvestigationStore } from '../investigation.store';
import { BackupService } from '../services/backup.service';
import { APP_VERSION } from '../shared/app-version';
import { goBackOr } from '../shared/navigation';
import { ToastController } from '../shared/toast.controller';

@Component({
  selector: 'app-about-page',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon],
  styleUrl: './about.page.css',
  template: `
    <ion-content fullscreen="true" class="about">
      <div class="frame">
        <header class="page-header">
          <button type="button" class="back-button" (click)="goHome()">
            <ion-icon name="arrow-back-outline"></ion-icon>
            <span>Back</span>
          </button>
          <div class="header-copy">
            <p class="eyebrow">Settings</p>
            <h1>About</h1>
          </div>
        </header>

        <section class="section">
          <h2>App</h2>
          <div class="kv">
            <div class="kv__row"><span class="kv__key">Version</span><span class="kv__value">{{ version }}</span></div>
            <div class="kv__row"><span class="kv__key">Made by</span><span class="kv__value">Christopher Miller</span></div>
            <div class="kv__row">
              <span class="kv__key">Privacy</span>
              <span class="kv__value">All data stays on this device.</span>
            </div>
          </div>
        </section>

        <section class="section">
          <h2><ion-icon name="archive-outline"></ion-icon> Backup &amp; restore</h2>
          <div class="kv">
            <div class="kv__row"><span class="kv__key">Investigations</span><span class="kv__value">{{ investigationCount() }}</span></div>
          </div>

          <div class="action-row action-row--first">
            <p class="action-desc">Export everything to a zip file containing a manifest and all media. Save it anywhere — Drive, Dropbox, USB, your laptop. Restore it later on this device or another.</p>
            <ion-button
              expand="block"
              fill="outline"
              color="light"
              (click)="exportAll()"
              [disabled]="busy()"
            >
              <ion-icon slot="start" name="cloud-download-outline"></ion-icon>
              {{ busy() === 'exporting' ? 'Exporting...' : 'Export everything (.zip)' }}
            </ion-button>
          </div>

          <div class="action-row">
            <p class="action-desc">Restore a previously-exported zip. Existing investigations with matching IDs are skipped — the existing copy wins, so it's safe to re-import without duplicating.</p>
            <ion-button
              expand="block"
              fill="outline"
              color="light"
              (click)="importFromZip()"
              [disabled]="busy()"
            >
              <ion-icon slot="start" name="cloud-upload-outline"></ion-icon>
              {{ busy() === 'importing' ? 'Restoring...' : 'Restore from backup (.zip)' }}
            </ion-button>
          </div>

          <p class="warning warning--spaced">
            Backups are not encrypted. Anyone with the zip can read the metadata and play back the media. Store backups somewhere private if your investigations are sensitive.
          </p>
        </section>

        <section class="section">
          <h2><ion-icon name="document-text-outline"></ion-icon> Privacy policy</h2>
          <p class="credit">
            ParaKit: Investigation Toolkit does not collect, transmit, or share any personal data. Location is only used to fetch outdoor weather from open-meteo.com (lat/lon only). The full policy ships in the repo as <code>PRIVACY.md</code>.
          </p>
        </section>
      </div>
    </ion-content>
  `
})
export class AboutPage {
  protected readonly version = APP_VERSION;

  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly store = inject(InvestigationStore);
  private readonly backupSvc = inject(BackupService);
  private readonly toastSvc = inject(ToastController);

  protected readonly investigationCount = computed(() => this.store.history().length);
  protected readonly busy = signal<'idle' | 'exporting' | 'importing'>('idle');

  constructor() {
    addIcons({ archiveOutline, arrowBackOutline, cloudDownloadOutline, cloudUploadOutline, documentTextOutline });
  }

  goHome(): void {
    goBackOr(this.location, this.router, '/');
  }

  async exportAll(): Promise<void> {
    if (this.busy() !== 'idle') return;
    if (this.investigationCount() === 0) {
      this.toastSvc.show('Nothing to export — no investigations yet.');
      return;
    }
    this.busy.set('exporting');
    try {
      const result = await this.backupSvc.exportAll(this.version);
      if (result.exported) {
        this.toastSvc.show(
          `Exported ${result.investigationCount} investigation${result.investigationCount === 1 ? '' : 's'} ` +
          `and ${result.mediaFileCount} media file${result.mediaFileCount === 1 ? '' : 's'}.`
        );
      } else {
        this.toastSvc.show('Export cancelled.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed.';
      this.toastSvc.show(`Export failed: ${message}`);
    } finally {
      this.busy.set('idle');
    }
  }

  async importFromZip(): Promise<void> {
    if (this.busy() !== 'idle') return;
    this.busy.set('importing');
    try {
      const result = await this.backupSvc.importBackup();
      if (result.imported) {
        const skipMsg = result.skipped > 0 ? `, ${result.skipped} already on device` : '';
        this.toastSvc.show(`Restored ${result.added} investigation${result.added === 1 ? '' : 's'}${skipMsg}.`);
      } else if (result.reason) {
        this.toastSvc.show(`Restore failed: ${result.reason}`);
      } else {
        this.toastSvc.show('Restore cancelled.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Restore failed.';
      this.toastSvc.show(`Restore failed: ${message}`);
    } finally {
      this.busy.set('idle');
    }
  }
}
