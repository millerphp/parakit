import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  analyticsOutline,
  cameraOutline,
  journalOutline,
  lockClosedOutline,
  micOutline,
  pulseOutline,
  radioOutline,
  scanOutline,
  settingsOutline,
  stopCircleOutline,
  timeOutline,
  videocamOutline
} from 'ionicons/icons';
import { InvestigationStore } from '../investigation.store';
import { formatHms } from '../shared/formatters';

type Tile = {
  title: string;
  icon: string;
  primary?: boolean;
  locked?: boolean;
  route?: string;
  action?: 'log-investigation' | 'stop-investigation';
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    IonContent,
    IonIcon
  ],
  styleUrl: './home.page.css',
  template: `
    <ion-content fullscreen="true" class="home">
      <button
        type="button"
        class="settings-btn"
        (click)="openAbout()"
        aria-label="Settings and about"
      >
        <ion-icon name="settings-outline" aria-hidden="true"></ion-icon>
      </button>

      @if (activeInvestigation(); as active) {
        <button
          type="button"
          class="active-banner"
          (click)="openActiveDetail(active.id)"
          [attr.aria-label]="'Active investigation: ' + (active.locationTitle || 'Untitled') + '. Tap to view detail.'"
        >
          <span class="active-banner__pulse"></span>
          <span class="active-banner__text">
            <span class="active-banner__title">{{ active.locationTitle?.trim() || 'Untitled investigation' }}</span>
            <span class="active-banner__meta">Active · {{ activeDuration() }}</span>
          </span>
          <ion-icon name="radio-outline"></ion-icon>
        </button>
      }

      <section class="tile-grid" aria-label="Home actions">
        @for (tile of tiles(); track $index) {
          <button
            type="button"
            class="tile"
            [class.tile--primary]="tile.primary"
            [class.tile--locked]="tile.locked"
            [attr.aria-label]="tile.locked ? tile.title + ' (locked — start an investigation first)' : tile.title"
            [disabled]="tile.locked"
            (click)="handleTileClick(tile)"
          >
            <span class="tile__icon">
              <ion-icon [name]="tile.locked ? 'lock-closed-outline' : tile.icon"></ion-icon>
            </span>
            <span class="tile__title">{{ tile.title }}</span>
          </button>
        }
      </section>
    </ion-content>
  `
})
export class HomePage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly investigationStore = inject(InvestigationStore);

  protected readonly activeInvestigation = this.investigationStore.activeInvestigation;
  private readonly nowSig = signal<number>(Date.now());
  private tickHandle: number | null = null;

  protected readonly activeDuration = computed(() => {
    const active = this.activeInvestigation();
    if (!active) return '';
    const ms = this.nowSig() - new Date(active.startedAt).getTime();
    return formatHms(ms);
  });

  protected readonly tiles = computed<Tile[]>(() => {
    const active = this.activeInvestigation();
    const locked = !active;

    return [
      active
        ? { title: 'Stop Investigation', icon: 'stop-circle-outline', primary: true, action: 'stop-investigation' }
        : { title: 'Start Investigation', icon: 'scan-outline', primary: true, action: 'log-investigation' },
      { title: 'Investigation History', icon: 'time-outline', route: '/investigation-history' },
      { title: 'Sound', icon: 'mic-outline', locked, route: '/evp' },
      { title: 'EMF', icon: 'pulse-outline', locked, route: '/emf' },
      { title: 'Photograph', icon: 'camera-outline', locked, route: '/photograph' },
      { title: 'Video', icon: 'videocam-outline', locked, route: '/video' },
      { title: 'Vibrations', icon: 'analytics-outline', locked, route: '/vibrations' },
      { title: 'Field Note', icon: 'journal-outline', locked, route: '/field-note' }
    ];
  });

  constructor() {
    addIcons({
      analyticsOutline,
      cameraOutline,
      journalOutline,
      lockClosedOutline,
      micOutline,
      pulseOutline,
      radioOutline,
      scanOutline,
      settingsOutline,
      stopCircleOutline,
      timeOutline,
      videocamOutline
    });

    // Tick the duration display once a second only while a session is active —
    // pause the interval entirely when there's nothing to count. setInterval
    // is zone-patched, so signal updates inside the callback already trigger
    // CD via the signal-graph; no need for explicit zone.run / markForCheck.
    effect(() => {
      const active = this.activeInvestigation();
      if (active && this.tickHandle === null) {
        this.tickHandle = window.setInterval(() => this.nowSig.set(Date.now()), 1000);
      } else if (!active && this.tickHandle !== null) {
        window.clearInterval(this.tickHandle);
        this.tickHandle = null;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.tickHandle !== null) {
      window.clearInterval(this.tickHandle);
    }
  }

  handleTileClick(tile: Tile): void {
    if (tile.locked) {
      return;
    }
    if (tile.action === 'stop-investigation') {
      const active = this.activeInvestigation();
      const label = active?.locationTitle?.trim() || 'this investigation';
      const ok = window.confirm(`Stop "${label}"? Evidence already saved will be kept; the session will be closed.`);
      if (!ok) return;
      this.investigationStore.stopActiveInvestigation();
      return;
    }
    if (tile.action === 'log-investigation') {
      void this.router.navigateByUrl('/log-investigation');
      return;
    }
    if (tile.route) {
      void this.router.navigateByUrl(tile.route);
    }
  }

  openActiveDetail(id: string): void {
    void this.router.navigateByUrl(`/investigation/${id}`);
  }

  openAbout(): void {
    void this.router.navigateByUrl('/about');
  }
}
