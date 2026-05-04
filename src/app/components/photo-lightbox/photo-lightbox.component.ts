import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

@Component({
  selector: 'app-photo-lightbox',
  standalone: true,
  imports: [IonIcon],
  styleUrl: './photo-lightbox.component.css',
  template: `
    <div class="lightbox" (click)="close.emit()">
      <button
        type="button"
        class="lightbox__close"
        (click)="$event.stopPropagation(); close.emit()"
        aria-label="Close"
      >
        <ion-icon name="close-outline"></ion-icon>
      </button>
      <img [src]="src" (click)="$event.stopPropagation()" alt="Photo at full size" />
    </div>
  `
})
export class PhotoLightboxComponent {
  @Input({ required: true }) src = '';
  @Output() close = new EventEmitter<void>();

  constructor() {
    addIcons({ closeOutline });
  }
}
