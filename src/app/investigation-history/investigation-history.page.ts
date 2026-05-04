import { CommonModule, Location } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  DatetimeChangeEventDetail,
  IonContent,
  IonDatetime,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  SegmentChangeEventDetail
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, chevronForwardOutline, playCircleOutline, scanOutline, serverOutline } from 'ionicons/icons';
import { InvestigationRecord, InvestigationStore } from '../investigation.store';
import { StorageService } from '../services/storage.service';
import { formatBytes } from '../shared/formatters';
import { goBackOr } from '../shared/navigation';
import { ToastController } from '../shared/toast.controller';

interface HighlightedDate {
  date: string;
  textColor: string;
  backgroundColor: string;
}

interface LocationGroup {
  key: string;
  title: string;
  records: InvestigationRecord[];
}

type ViewMode = 'date' | 'location';

@Component({
  selector: 'app-investigation-history-page',
  standalone: true,
  imports: [CommonModule, IonContent, IonDatetime, IonIcon, IonLabel, IonSegment, IonSegmentButton],
  styleUrl: './investigation-history.page.css',
  template: `
    <ion-content fullscreen="true" class="history">
      <div class="frame">
        <header class="page-header">
          <button type="button" class="back-button" (click)="goHome()">
            <ion-icon name="arrow-back-outline"></ion-icon>
            <span>Back</span>
          </button>

          <div class="header-copy">
            <p class="eyebrow">Archive</p>
            <h1>Investigation History</h1>
          </div>
        </header>

        <ion-segment [value]="view()" (ionChange)="onViewChange($event)" class="segment">
          <ion-segment-button value="date">
            <ion-label>By date</ion-label>
          </ion-segment-button>
          <ion-segment-button value="location">
            <ion-label>By location</ion-label>
          </ion-segment-button>
        </ion-segment>

        @if (view() === 'date') {
          <section class="calendar-card">
            <ion-datetime
              presentation="date"
              [highlightedDates]="highlightedDates()"
              [value]="selectedDateKey()"
              (ionChange)="onDateChange($event)"
            ></ion-datetime>
          </section>

          <section class="list-card">
            <h2>{{ selectedDateLabel() }}</h2>

            @if (selectedInvestigations().length === 0) {
              <p class="empty">
                @if (store.history().length === 0) {
                  No investigations yet — start one from the home screen.
                } @else {
                  Nothing recorded on this date. Pick another from the calendar above.
                }
              </p>
            } @else {
              @for (investigation of selectedInvestigations(); track investigation.id) {
                <div class="investigation-row">
                  <button type="button" class="row-main" (click)="openDetail(investigation.id)">
                    <div class="row-text">
                      <div class="row-title">{{ rowTitle(investigation) }}</div>
                      <div class="row-meta">{{ rowMeta(investigation) }}</div>
                    </div>
                    <ion-icon name="chevron-forward-outline"></ion-icon>
                  </button>
                  @if (canResume(investigation)) {
                    <button type="button" class="row-resume" (click)="resume(investigation.id)">
                      <ion-icon name="play-circle-outline"></ion-icon>
                      <span>Resume</span>
                    </button>
                  }
                </div>
              }
            }
          </section>
        } @else {
          @if (locationGroups().length === 0) {
            <section class="list-card empty-card">
              <p class="empty-card__title">No investigations yet</p>
              <p class="empty-card__body">Sessions are grouped by location once you've recorded at least one.</p>
              <button type="button" class="empty-card__action" (click)="startInvestigation()">
                <ion-icon name="scan-outline" aria-hidden="true"></ion-icon>
                <span>Start an investigation</span>
              </button>
            </section>
          } @else {
            @for (group of locationGroups(); track group.key) {
              <section class="list-card">
                <h2>{{ group.title }} <span class="count-pill">{{ group.records.length }}</span></h2>
                @for (investigation of group.records; track investigation.id) {
                  <div class="investigation-row">
                    <button type="button" class="row-main" (click)="openDetail(investigation.id)">
                      <div class="row-text">
                        <div class="row-title">{{ formatDateLabel(investigation.startedAt) }}</div>
                        <div class="row-meta">{{ rowMeta(investigation) }}</div>
                      </div>
                      <ion-icon name="chevron-forward-outline"></ion-icon>
                    </button>
                    @if (canResume(investigation)) {
                      <button type="button" class="row-resume" (click)="resume(investigation.id)">
                        <ion-icon name="play-circle-outline"></ion-icon>
                        <span>Resume</span>
                      </button>
                    }
                  </div>
                }
              </section>
            }
          }
        }
        <section class="list-card">
          <h2><ion-icon name="server-outline"></ion-icon> Storage</h2>
          @if (storageUsage(); as u) {
            <div class="storage-row"><span>Photos</span><span>{{ fmt(u.photosBytes) }}</span></div>
            <div class="storage-row"><span>Videos</span><span>{{ fmt(u.videosBytes) }}</span></div>
            <div class="storage-row"><span>Sound</span><span>{{ fmt(u.evpBytes) }}</span></div>
            <div class="storage-row storage-row--total"><span>Total evidence</span><span>{{ fmt(u.totalBytes) }}</span></div>
          } @else {
            <p class="empty">Storage info unavailable.</p>
          }
        </section>

      </div>
    </ion-content>
  `
})
export class InvestigationHistoryPage {
  protected readonly store = inject(InvestigationStore);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly storageSvc = inject(StorageService);
  private readonly toastSvc = inject(ToastController);

  protected readonly selectedDateKey = signal(localDateKey(new Date()));
  protected readonly view = signal<ViewMode>('date');
  protected readonly storageUsage = this.storageSvc.usage;

  protected readonly locationGroups = computed<LocationGroup[]>(() => {
    const groups = new Map<string, LocationGroup>();
    for (const record of this.store.history()) {
      const title = record.locationTitle?.trim() || 'Untitled investigation';
      const key = title.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.records.push(record);
      } else {
        groups.set(key, { key, title, records: [record] });
      }
    }
    const list = Array.from(groups.values());
    list.forEach((g) => g.records.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
    list.sort((a, b) => b.records[0].startedAt.localeCompare(a.records[0].startedAt));
    return list;
  });

  // Memoise on the joined date key so we hand ion-datetime the same array
  // reference whenever the underlying set of investigation-dates is unchanged
  // (e.g. mutating notes on an existing investigation shouldn't re-render the
  // calendar). Re-creates only when a new date appears or one disappears.
  private cachedHighlights = { key: '', value: [] as HighlightedDate[] };
  protected readonly highlightedDates = computed<HighlightedDate[]>(() => {
    const dates = Array.from(
      new Set(this.store.history().map((r) => localDateKey(new Date(r.startedAt))))
    ).sort();
    const key = dates.join(',');
    if (key === this.cachedHighlights.key) {
      return this.cachedHighlights.value;
    }
    const value = dates.map((date) => ({
      date,
      textColor: '#0a1118',
      backgroundColor: 'rgba(124, 247, 199, 0.85)'
    }));
    this.cachedHighlights = { key, value };
    return value;
  });

  protected readonly selectedInvestigations = computed<InvestigationRecord[]>(() => {
    const key = this.selectedDateKey();
    return this.store
      .history()
      .filter((r) => localDateKey(new Date(r.startedAt)) === key)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  });

  protected readonly selectedDateLabel = computed(() => {
    const parts = this.selectedDateKey().split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
      return 'Today';
    }
    const [year, month, day] = parts;
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) {
      return 'Today';
    }
    return date.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  });

  constructor() {
    addIcons({ arrowBackOutline, chevronForwardOutline, playCircleOutline, scanOutline, serverOutline });
    void this.storageSvc.refresh();
  }

  goHome(): void {
    goBackOr(this.location, this.router, '/');
  }

  startInvestigation(): void {
    void this.router.navigateByUrl('/log-investigation');
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

  fmt(bytes: number): string {
    return formatBytes(bytes);
  }

  openDetail(id: string): void {
    void this.router.navigateByUrl(`/investigation/${id}`);
  }

  onDateChange(event: CustomEvent<DatetimeChangeEventDetail>): void {
    const value = event.detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (typeof iso === 'string') {
      this.selectedDateKey.set(iso.slice(0, 10));
    }
  }

  rowTitle(record: InvestigationRecord): string {
    return record.locationTitle?.trim() || 'Untitled investigation';
  }

  rowMeta(record: InvestigationRecord): string {
    const time = new Date(record.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const status = record.status === 'active' ? 'Active' : 'Stopped';
    return `${time} · ${status}`;
  }

  formatDateLabel(iso: string): string {
    return new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  onViewChange(event: CustomEvent<SegmentChangeEventDetail>): void {
    const value = event.detail.value;
    if (value === 'date' || value === 'location') {
      this.view.set(value);
    }
  }
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
