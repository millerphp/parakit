import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonTextarea } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  bookmarkOutline,
  journalOutline,
  timeOutline
} from 'ionicons/icons';
import { FieldNoteEvidence, InvestigationStore } from '../investigation.store';
import { createEvidenceId, formatTime } from '../shared/formatters';

@Component({
  selector: 'app-field-note-page',
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonContent, IonIcon, IonTextarea],
  styleUrl: './field-note.page.css',
  template: `
    <ion-content fullscreen="true" class="field-note">
      <div class="frame">
        <header class="page-header">
          <button type="button" class="back-button" (click)="goHome()">
            <ion-icon name="arrow-back-outline"></ion-icon>
            <span>Back</span>
          </button>
          <div class="header-copy">
            <p class="eyebrow">{{ activeTitle() }}</p>
            <h1>Field Note</h1>
          </div>
        </header>

        @if (!hasActiveInvestigation()) {
          <section class="section">
            <p class="notice notice--warn">No active investigation — start one before logging field notes.</p>
          </section>
        } @else {
          <section class="section">
            <div class="section__label">
              <ion-icon name="journal-outline"></ion-icon>
              New entry
            </div>
            <ion-textarea
              [(ngModel)]="draft"
              labelPlacement="stacked"
              autoGrow="true"
              rows="4"
              placeholder="Heard footsteps in upstairs hallway, no one there..."
            ></ion-textarea>
            <ion-button expand="block" color="primary" (click)="save()" [disabled]="!canSave()">
              <ion-icon slot="start" name="bookmark-outline"></ion-icon>
              Save note
            </ion-button>
          </section>

          <section class="section">
            <div class="section__label">
              <ion-icon name="time-outline"></ion-icon>
              This session ({{ entries().length }})
            </div>
            @if (entries().length === 0) {
              <p class="empty">No notes yet.</p>
            } @else {
              @for (entry of entries(); track entry.id) {
                <article class="entry">
                  <div class="entry__time">{{ formatTime(entry.capturedAt) }}</div>
                  <div class="entry__text">{{ entry.text }}</div>
                </article>
              }
            }
          </section>
        }
      </div>
    </ion-content>
  `
})
export class FieldNotePage {
  private readonly router = inject(Router);
  private readonly store = inject(InvestigationStore);

  protected draft = '';

  protected readonly hasActiveInvestigation = computed(
    () => this.store.activeInvestigation() !== null
  );

  protected readonly activeTitle = computed(() => {
    const active = this.store.activeInvestigation();
    return active?.locationTitle?.trim() || 'Active investigation';
  });

  protected readonly entries = computed<FieldNoteEvidence[]>(() => {
    const active = this.store.activeInvestigation();
    if (!active) return [];
    return (active.evidence ?? [])
      .filter((e): e is FieldNoteEvidence => e.type === 'field-note')
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  });

  constructor() {
    addIcons({ arrowBackOutline, bookmarkOutline, journalOutline, timeOutline });
  }

  protected canSave(): boolean {
    return this.draft.trim().length > 0 && this.hasActiveInvestigation();
  }

  save(): void {
    if (!this.canSave()) return;
    const text = this.draft.trim();
    const entry: FieldNoteEvidence = {
      id: createEvidenceId(),
      type: 'field-note',
      capturedAt: new Date().toISOString(),
      text
    };
    this.store.appendEvidenceToActive(entry);
    this.draft = '';
  }

  protected readonly formatTime = formatTime;

  goHome(): void {
    void this.router.navigateByUrl('/');
  }
}
