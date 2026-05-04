import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-investigation-metric-card',
  standalone: true,
  imports: [CommonModule, IonIcon],
  styleUrl: './investigation-metric-card.component.css',
  template: `
    <article class="metric-card">
      <div class="metric-card__label">
        <ion-icon [name]="icon"></ion-icon>
        {{ label }}
      </div>

      @if (loading) {
        <div class="metric-card__value metric-card__value--loading">
          <span class="metric-card__spinner"></span>
          {{ loadingText || 'Loading' }}
        </div>
      } @else if (errorText) {
        <div class="metric-card__value metric-card__value--error">{{ errorText }}</div>
      } @else {
        <div class="metric-card__value">{{ value }}</div>
        @if (meta) {
          <div class="metric-card__meta">{{ meta }}</div>
        }
      }

      @if (statusText) {
        <div class="metric-card__meta metric-card__meta--status">{{ statusText }}</div>
      }
    </article>
  `
})
export class InvestigationMetricCardComponent {
  @Input({ required: true }) label = '';
  @Input({ required: true }) icon = '';
  @Input() loading = false;
  @Input() loadingText = '';
  @Input() errorText = '';
  @Input() value = '';
  @Input() meta = '';
  @Input() statusText = '';
}
