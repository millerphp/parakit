import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonTextarea
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, saveOutline } from 'ionicons/icons';
import { InvestigationStore } from '../investigation.store';

@Component({
  selector: 'app-investigation-edit-page',
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonContent, IonIcon, IonInput, IonTextarea],
  styleUrl: './investigation-edit.page.css',
  template: `
    <ion-content fullscreen="true" class="edit">
      <div class="frame">
        <header class="page-header">
          <button type="button" class="back-button" (click)="cancel()">
            <ion-icon name="arrow-back-outline"></ion-icon>
            <span>Cancel</span>
          </button>
          <div class="header-copy">
            <p class="eyebrow">Editing</p>
            <h1>Investigation</h1>
          </div>
        </header>

        @if (notFound()) {
          <section class="section">
            <p class="notice">Investigation not found.</p>
          </section>
        } @else {
          <section class="section">
            <ion-input
              [(ngModel)]="locationTitle"
              label="Location title"
              labelPlacement="stacked"
              placeholder="e.g. Old Mill House, Smith Residence"
              required
            ></ion-input>
            <ion-textarea
              [(ngModel)]="investigationReason"
              label="Investigation reason"
              labelPlacement="stacked"
              autoGrow="true"
              rows="3"
              placeholder="Why were you called? What's been reported?"
            ></ion-textarea>
            <ion-textarea
              [(ngModel)]="notes"
              label="Field notes"
              labelPlacement="stacked"
              autoGrow="true"
              rows="4"
              placeholder="Anything else relevant..."
            ></ion-textarea>

            <div class="actions">
              <ion-button fill="outline" color="light" (click)="cancel()">Cancel</ion-button>
              <ion-button color="primary" (click)="save()" [disabled]="!canSave()">
                <ion-icon slot="start" name="save-outline"></ion-icon>
                Save
              </ion-button>
            </div>
          </section>
        }
      </div>
    </ion-content>
  `
})
export class InvestigationEditPage implements OnInit {
  private readonly store = inject(InvestigationStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected locationTitle = '';
  protected investigationReason = '';
  protected notes = '';
  private id = '';

  protected readonly notFound = signal(false);
  protected readonly canSave = computed(() => this.locationTitle.trim().length > 0);

  constructor() {
    addIcons({ arrowBackOutline, saveOutline });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound.set(true);
      return;
    }
    this.id = id;
    const record = this.store.history().find((r) => r.id === id);
    if (!record) {
      this.notFound.set(true);
      return;
    }
    this.locationTitle = record.locationTitle;
    this.investigationReason = record.investigationReason;
    this.notes = record.notes;
  }

  save(): void {
    if (!this.canSave()) return;
    this.store.updateInvestigation(this.id, {
      locationTitle: this.locationTitle,
      investigationReason: this.investigationReason,
      notes: this.notes
    });
    void this.router.navigateByUrl(`/investigation/${this.id}`);
  }

  cancel(): void {
    void this.router.navigateByUrl(`/investigation/${this.id}`);
  }
}
