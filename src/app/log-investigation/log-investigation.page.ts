import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InvestigationMetricCardComponent } from '../components/investigation-metric-card/investigation-metric-card.component';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonInput,
  IonTextarea
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  cloudyOutline,
  locateOutline,
  moonOutline,
  saveOutline,
  thermometerOutline,
  timeOutline,
  waterOutline,
} from 'ionicons/icons';
import {
  InvestigationDraft,
  InvestigationLocation,
  InvestigationMoon,
  InvestigationStore,
  InvestigationWeather
} from '../investigation.store';
import { LocationError, LocationService } from '../services/location.service';
import { withTimeout } from '../shared/with-timeout';

type WeatherPayload = {
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKph: number | null;
  weatherCode: number | null;
  weatherLabel: string;
  observedAt: string;
  elevationMeters: number | null;
};

const SYNODIC_MONTH = 29.53058867;
const NEW_MOON_REFERENCE = Date.UTC(2000, 0, 6, 18, 14, 0);

@Component({
  selector: 'app-log-investigation-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    InvestigationMetricCardComponent,
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonIcon,
    IonInput,
    IonTextarea
  ],
  styleUrl: './log-investigation.page.css',
  template: `
    <ion-content fullscreen="true" class="investigation">
      <div class="frame">
        <header class="page-header">
          <button type="button" class="back-button" (click)="goHome()">
            <ion-icon name="arrow-back-outline"></ion-icon>
            <span>Back</span>
          </button>

          <div class="header-copy">
            <p class="eyebrow">Field intake</p>
            <h1>Start Investigation</h1>
            <p class="lede">
              Capture the environment first, then save the session and make it the active primary field.
            </p>
          </div>

          <div class="header-chip" [class.header-chip--ready]="readyToSave">
            {{ readyToSave ? 'Ready' : 'Locating' }}
          </div>
        </header>

        @if (activeSessionError) {
          <ion-card class="status-card status-card--error">
            <ion-card-content>
              <p>{{ activeSessionError }}</p>
            </ion-card-content>
          </ion-card>
        }

        @if (captureError) {
          <ion-card class="status-card status-card--error">
            <ion-card-content>
              <p>{{ captureError }}</p>
              <ion-button
                fill="outline"
                size="small"
                color="light"
                (click)="retryCapture()"
                [disabled]="locationLoading || weatherLoading"
              >
                {{ locationLoading || weatherLoading ? 'Retrying...' : 'Retry capture' }}
              </ion-button>
            </ion-card-content>
          </ion-card>
        }

        <section class="summary-grid">
          <app-investigation-metric-card
            label="GPS"
            icon="locate-outline"
            [loading]="locationLoading"
            loadingText="Acquiring location"
            [errorText]="locationError"
            [value]="gpsValue"
            [meta]="gpsMeta"
            [statusText]="locationStatus"
          ></app-investigation-metric-card>

          <app-investigation-metric-card
            label="Weather"
            icon="cloudy-outline"
            [loading]="weatherLoading"
            loadingText="Fetching conditions"
            [errorText]="weatherError"
            [value]="weatherLabel"
            [meta]="weatherSummary"
            [statusText]="weatherStatus"
          ></app-investigation-metric-card>

          <app-investigation-metric-card
            label="Moon cycle"
            icon="moon-outline"
            [value]="moon.phaseName"
            [meta]="moonMeta"
          ></app-investigation-metric-card>

          <app-investigation-metric-card
            label="Elevation"
            icon="thermometer-outline"
            [value]="elevationText"
            meta="Above sea level, if available"
          ></app-investigation-metric-card>
        </section>

        <section class="details-card">
          <div class="details-row">
            <article>
              <div class="metric-card__label">
                <ion-icon name="time-outline"></ion-icon>
                Date and time
              </div>
              <div class="metric-card__value">{{ timeLabel }}</div>
              <div class="metric-card__meta">{{ dateLabel }}</div>
            </article>

            <article>
              <div class="metric-card__label">
                <ion-icon name="water-outline"></ion-icon>
                Primary field
              </div>
              <div class="metric-card__value">{{ primaryFieldLabel }}</div>
              <div class="metric-card__meta">{{ primaryFieldMeta }}</div>
            </article>
          </div>
        </section>

        <section class="notes-card">
          <div class="metric-card__label">
            <ion-icon name="save-outline"></ion-icon>
            Brief
          </div>
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
            placeholder="Why were you called? What's been reported?"
          ></ion-textarea>
        </section>

        <section class="notes-card">
          <div class="metric-card__label">
            <ion-icon name="save-outline"></ion-icon>
            Field notes
          </div>
          <ion-textarea
            [(ngModel)]="notes"
            label="Free notes"
            labelPlacement="stacked"
            autoGrow="true"
            placeholder="Write anything else relevant to the investigation..."
          ></ion-textarea>
        </section>

        <ion-button
          expand="block"
          class="save-button"
          color="primary"
          (click)="saveAndStart()"
          [disabled]="!readyToSave || saving"
        >
          {{ saving ? 'Saving...' : 'Save and Start' }}
        </ion-button>
      </div>
    </ion-content>
  `
})
export class LogInvestigationPage implements OnInit, OnDestroy {
  private static readonly LOG = '[Paranormal][LogInvestigation]';
  private static readonly LOCATION_TIMEOUT_MS = 14000;

  private locationTickerHandle: number | null = null;

  locationTitle = '';
  investigationReason = '';
  notes = '';
  saving = false;
  locationLoading = true;
  weatherLoading = true;
  locationError = '';
  activeSessionError = '';
  captureError = '';

  gpsValue = '--';
  gpsMeta = 'Waiting for device location';
  elevationText = 'Unavailable';
  timeLabel = '';
  dateLabel = '';
  weatherLabel = 'Unavailable';
  weatherSummary = 'Waiting for weather data';
  weatherError = '';
  weatherStatus = 'Requesting current weather...';
  primaryFieldLabel = 'Draft';
  primaryFieldMeta = 'Will be set when saved';
  locationStatus = 'Checking device location...';
  moonMeta = 'Awaiting lunar calculation';

  location: InvestigationLocation | null = null;
  weather: InvestigationWeather | null = null;
  moon: InvestigationMoon = {
    phaseName: 'Unknown',
    illuminationPct: 0,
    ageDays: 0
  };
  observedAt = new Date().toISOString();

  constructor(
    private readonly router: Router,
    private readonly investigationStore: InvestigationStore,
    private readonly locationService: LocationService,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {
    addIcons({
      arrowBackOutline,
      cloudyOutline,
      locateOutline,
      moonOutline,
      saveOutline,
      thermometerOutline,
      timeOutline,
      waterOutline
    });
  }

  get readyToSave(): boolean {
    return !!this.location && !!this.weather && !this.saving && this.locationTitle.trim().length > 0;
  }

  async ngOnInit(): Promise<void> {
    const now = new Date();
    this.observedAt = now.toISOString();
    this.timeLabel = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short'
    });
    this.dateLabel = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    this.moon = this.computeMoon(now);
    this.moonMeta = `${this.moon.illuminationPct}% illuminated, age ${this.moon.ageDays} days`;
    this.primaryFieldLabel = this.investigationStore.activeInvestigation() ? 'Already active' : 'Draft';
    this.primaryFieldMeta = this.investigationStore.activeInvestigation()
      ? 'Stop the current session from the home tile before starting another.'
      : 'Will become the active primary field after save.';

    if (this.investigationStore.activeInvestigation()) {
      this.activeSessionError = 'An investigation is already active. Stop it from the home screen before starting another.';
    }

    await this.captureLocationAndWeather();
  }

  ngOnDestroy(): void {
    this.stopLocationTicker();
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }

  async retryCapture(): Promise<void> {
    console.info(`${LogInvestigationPage.LOG} retryCapture: resetting state`);
    this.location = null;
    this.weather = null;
    this.locationLoading = true;
    this.weatherLoading = true;
    this.locationError = '';
    this.weatherError = '';
    this.captureError = '';
    this.gpsValue = '--';
    this.gpsMeta = 'Waiting for device location';
    this.locationStatus = 'Checking device location...';
    this.weatherLabel = 'Unavailable';
    this.weatherSummary = 'Waiting for weather data';
    this.weatherStatus = 'Requesting current weather...';
    this.elevationText = 'Unavailable';
    await this.captureLocationAndWeather();
  }

  async saveAndStart(): Promise<void> {
    if (!this.location || !this.weather) {
      this.locationError = this.locationError || 'Location and weather are required before saving.';
      return;
    }

    this.saving = true;
    try {
      const draft: InvestigationDraft = {
        locationTitle: this.locationTitle,
        investigationReason: this.investigationReason,
        notes: this.notes,
        location: this.location,
        weather: this.weather,
        moon: this.moon,
        observedAt: this.observedAt
      };

      this.investigationStore.startInvestigation(draft);
      await this.router.navigateByUrl('/');
    } finally {
      this.saving = false;
    }
  }

  private startLocationTicker(t0: number, stage: 'fast' | 'precise'): void {
    this.stopLocationTicker();
    const label = stage === 'fast' ? 'Acquiring fast fix' : 'Acquiring precise fix';
    const tick = () => {
      this.zone.run(() => {
        const seconds = Math.floor((performance.now() - t0) / 1000);
        this.locationStatus = `${label}... ${seconds}s`;
        this.cdr.markForCheck();
      });
    };
    tick();
    this.locationTickerHandle = window.setInterval(tick, 250);
  }

  private stopLocationTicker(): void {
    if (this.locationTickerHandle !== null) {
      window.clearInterval(this.locationTickerHandle);
      this.locationTickerHandle = null;
    }
  }

  private async captureLocationAndWeather(): Promise<void> {
    const tStart = performance.now();
    try {
      this.locationStatus = 'Requesting device location...';
      console.info(`${LogInvestigationPage.LOG} captureLocationAndWeather: requesting device location`);
      this.startLocationTicker(tStart, 'fast');
      const snapshot = await this.withTimeout(
        this.locationService.getCurrentPosition((stage) => this.startLocationTicker(tStart, stage)),
        LogInvestigationPage.LOCATION_TIMEOUT_MS,
        'Location request timed out after 14s — see logcat for details.'
      );
      this.stopLocationTicker();
      console.info(
        `${LogInvestigationPage.LOG} captureLocationAndWeather: location resolved in ${Math.round(performance.now() - tStart)}ms ` +
          `${snapshot.latitude.toFixed(5)}, ${snapshot.longitude.toFixed(5)} ` +
          `accuracy=${snapshot.accuracyMeters ?? 'n/a'} altitude=${snapshot.altitudeMeters ?? 'n/a'} ` +
          `fixMs=${snapshot.fixAgeMs} totalMs=${snapshot.totalElapsedMs}`
      );
      this.zone.run(() => {
        this.location = {
          latitude: snapshot.latitude,
          longitude: snapshot.longitude,
          accuracyMeters: snapshot.accuracyMeters,
          altitudeMeters: snapshot.altitudeMeters
        };
        this.gpsValue = `${snapshot.latitude.toFixed(5)}, ${snapshot.longitude.toFixed(5)}`;
        const gpsMetaParts = [
          snapshot.accuracyMeters !== null ? `Accuracy ${Math.round(snapshot.accuracyMeters)} m` : null,
          snapshot.altitudeMeters !== null ? `Altitude ${Math.round(snapshot.altitudeMeters)} m` : null
        ].filter((part): part is string => Boolean(part));
        this.gpsMeta = gpsMetaParts.length ? gpsMetaParts.join(' · ') : 'Accuracy unavailable';
        this.elevationText = snapshot.altitudeMeters !== null ? `${Math.round(snapshot.altitudeMeters)} m` : this.elevationText;
        this.locationStatus = `Location acquired (${snapshot.fixAgeMs} ms)`;
        this.locationLoading = false;
        this.cdr.markForCheck();
      });
    } catch (error) {
      this.stopLocationTicker();
      const code = error instanceof LocationError ? error.code : 'UNKNOWN';
      const nativeCode = error instanceof LocationError ? error.nativeCode ?? 'n/a' : 'n/a';
      const message = error instanceof Error ? error.message : 'Unable to capture location.';
      console.error(
        `${LogInvestigationPage.LOG} captureLocationAndWeather: location error ` +
          `code=${code} nativeCode=${nativeCode} elapsedMs=${Math.round(performance.now() - tStart)} ` +
          `message="${message}"`
      );
      this.zone.run(() => {
        this.locationError = `${message} (code ${nativeCode})`;
        this.captureError = `${message} (code ${nativeCode})`;
        this.locationStatus = `Location unavailable after ${Math.round((performance.now() - tStart) / 1000)}s`;
        this.gpsValue = 'Unavailable';
        this.gpsMeta = 'Location unavailable';
        this.weatherLabel = 'Unavailable';
        this.weatherSummary = 'Location required before weather lookup.';
        this.weatherStatus = 'Location unavailable';
        this.elevationText = 'Unavailable';
        this.weatherLoading = false;
        this.locationLoading = false;
        this.cdr.markForCheck();
      });
      return;
    }

    try {
      if (!this.location) {
        throw new Error('Unable to continue without location.');
      }

      this.weatherStatus = 'Fetching current weather...';
      console.info(
        `${LogInvestigationPage.LOG} requesting weather ` +
          `${this.location.latitude.toFixed(5)}, ${this.location.longitude.toFixed(5)}`
      );
      const weatherAbort = new AbortController();
      const weatherTimer = window.setTimeout(() => weatherAbort.abort(), 12000);
      let weather: WeatherPayload;
      try {
        weather = await this.fetchWeather(this.location.latitude, this.location.longitude, weatherAbort.signal);
      } catch (e) {
        if (weatherAbort.signal.aborted) {
          throw new Error('Weather request timed out.');
        }
        throw e;
      } finally {
        window.clearTimeout(weatherTimer);
      }
      this.zone.run(() => {
        this.weather = weather;
        this.weatherLabel = weather.weatherLabel;
        this.weatherSummary = this.buildWeatherSummary(weather);
        this.elevationText = weather.elevationMeters !== null
          ? `${Math.round(weather.elevationMeters)} m`
          : this.elevationText;
        this.weatherStatus = 'Weather acquired';
        this.weatherLoading = false;
        this.cdr.markForCheck();
      });
      console.info(
        `${LogInvestigationPage.LOG} weather resolved ` +
          `${weather.weatherLabel} temp=${weather.temperatureC ?? 'n/a'} ` +
          `humidity=${weather.humidityPct ?? 'n/a'} wind=${weather.windSpeedKph ?? 'n/a'}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch current weather.';
      console.error(`${LogInvestigationPage.LOG} weather error message="${message}"`);
      this.zone.run(() => {
        this.weatherError = message;
        this.weatherLabel = 'Unavailable';
        this.weatherSummary = message;
        this.weatherStatus = 'Weather unavailable';
        if (!this.captureError) {
          this.captureError = message;
        }
        this.weatherLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  private async fetchWeather(latitude: number, longitude: number, signal?: AbortSignal): Promise<WeatherPayload> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
    url.searchParams.set('timezone', 'auto');

    const response = await fetch(url.toString(), { signal });
    if (!response.ok) {
      throw new Error('Unable to fetch current weather.');
    }

    const data = await response.json() as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        time?: string;
      };
      elevation?: number;
    };

    const current = data.current ?? {};
    const weatherCode = typeof current.weather_code === 'number' ? current.weather_code : null;

    return {
      temperatureC: typeof current.temperature_2m === 'number' ? current.temperature_2m : null,
      humidityPct: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : null,
      windSpeedKph: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : null,
      weatherCode,
      weatherLabel: this.describeWeatherCode(weatherCode),
      observedAt: current.time ?? this.observedAt,
      elevationMeters: typeof data.elevation === 'number' ? data.elevation : null
    };
  }

  private withTimeout = withTimeout;

  private buildWeatherSummary(weather: WeatherPayload): string {
    const parts = [
      weather.temperatureC !== null ? `${weather.temperatureC.toFixed(1)} C` : null,
      weather.humidityPct !== null ? `Humidity ${weather.humidityPct}%` : null,
      weather.windSpeedKph !== null ? `Wind ${weather.windSpeedKph.toFixed(0)} kph` : null
    ].filter((part): part is string => Boolean(part));

    return parts.length ? parts.join(' · ') : 'Weather data unavailable';
  }

  private computeMoon(date: Date): InvestigationMoon {
    const ageDays = this.mod((date.getTime() - NEW_MOON_REFERENCE) / 86400000, SYNODIC_MONTH);
    const illumination = 0.5 * (1 - Math.cos((2 * Math.PI * ageDays) / SYNODIC_MONTH));
    // Display age as days *into* the current synodic cycle. The wrap-around
    // (ageDays > 27.685) is labeled "New Moon" by describeMoonPhase, so show
    // the age relative to the upcoming new moon (small negative-ish → 0)
    // instead of "29.5d" which contradicts the phase label.
    const displayAge = ageDays > 27.68493 ? 0 : Math.round(ageDays * 10) / 10;

    return {
      phaseName: this.describeMoonPhase(ageDays),
      illuminationPct: Math.round(illumination * 100),
      ageDays: displayAge
    };
  }

  private describeMoonPhase(ageDays: number): string {
    if (ageDays < 1.84566) return 'New Moon';
    if (ageDays < 5.53699) return 'Waxing Crescent';
    if (ageDays < 9.22831) return 'First Quarter';
    if (ageDays < 12.91963) return 'Waxing Gibbous';
    if (ageDays < 16.61096) return 'Full Moon';
    if (ageDays < 20.30228) return 'Waning Gibbous';
    if (ageDays < 23.99361) return 'Last Quarter';
    if (ageDays < 27.68493) return 'Waning Crescent';
    return 'New Moon';
  }

  private describeWeatherCode(code: number | null): string {
    const labels: Record<number, string> = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Fog',
      48: 'Depositing rime fog',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Dense drizzle',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      71: 'Slight snow',
      73: 'Moderate snow',
      75: 'Heavy snow',
      80: 'Rain showers',
      81: 'Heavy rain showers',
      82: 'Violent rain showers',
      95: 'Thunderstorm'
    };

    return code === null ? 'Unavailable' : labels[code] ?? `Weather code ${code}`;
  }

  private mod(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor;
  }
}
