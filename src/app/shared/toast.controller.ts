import { Injectable, NgZone, inject, signal } from '@angular/core';

/**
 * App-global toast. Mounted once at the root via ToastHostComponent;
 * any service or component can call show() to surface a transient message
 * regardless of which page is on screen.
 */
@Injectable({ providedIn: 'root' })
export class ToastController {
  private readonly zone = inject(NgZone);
  private readonly messageSig = signal<string>('');
  private timer: number | null = null;

  readonly message = this.messageSig.asReadonly();

  show(message: string, durationMs = 2400): void {
    this.zone.run(() => this.messageSig.set(message));
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.zone.run(() => this.messageSig.set(''));
      this.timer = null;
    }, durationMs);
  }

  clear(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.messageSig.set('');
  }
}
