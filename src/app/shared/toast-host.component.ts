import { Component, inject } from '@angular/core';
import { ToastController } from './toast.controller';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  styleUrl: './toast-host.component.css',
  template: `
    @if (toastSvc.message(); as msg) {
      <div class="floating-toast" role="status" aria-live="polite">{{ msg }}</div>
    }
  `
})
export class ToastHostComponent {
  protected readonly toastSvc = inject(ToastController);
}
