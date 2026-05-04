import { Injectable, signal } from '@angular/core';
import { createEvidenceId } from './shared/formatters';

export interface InvestigationLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  altitudeMeters: number | null;
}

export interface InvestigationWeather {
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKph: number | null;
  weatherCode: number | null;
  weatherLabel: string;
  observedAt: string;
}

export interface InvestigationMoon {
  phaseName: string;
  illuminationPct: number;
  ageDays: number;
}

export interface EmfEvidence {
  id: string;
  type: 'emf';
  capturedAt: string;
  magnitudeMicroT: number;
  baselineMicroT: number;
  deviationMicroT: number;
  bin: number;
  components: { x: number; y: number; z: number };
  note?: string;
}

export interface VibrationEvidence {
  id: string;
  type: 'vibration';
  capturedAt: string;
  magnitudeMs2: number;
  peakSinceCalibrationMs2: number;
  bin: number;
  components: { x: number; y: number; z: number };
  note?: string;
}

export interface FieldNoteEvidence {
  id: string;
  type: 'field-note';
  capturedAt: string;
  text: string;
}

export interface EvpEvidence {
  id: string;
  type: 'evp';
  capturedAt: string;
  filePath: string;
  durationMs: number;
  sizeBytes: number;
  note?: string;
}

export interface PhotoEvidence {
  id: string;
  type: 'photo';
  capturedAt: string;
  filePath: string;
  sizeBytes: number;
  note?: string;
}

export interface VideoEvidence {
  id: string;
  type: 'video';
  capturedAt: string;
  filePath: string;
  durationMs: number;
  sizeBytes: number;
  note?: string;
}

export type Evidence =
  | EmfEvidence
  | VibrationEvidence
  | FieldNoteEvidence
  | EvpEvidence
  | PhotoEvidence
  | VideoEvidence;

export interface InvestigationRecord {
  id: string;
  status: 'active' | 'stopped';
  startedAt: string;
  stoppedAt: string | null;
  locationTitle: string;
  investigationReason: string;
  notes: string;
  location: InvestigationLocation;
  weather: InvestigationWeather;
  moon: InvestigationMoon;
  observedAt: string;
  evidence: Evidence[];
}

export interface InvestigationDraft {
  locationTitle: string;
  investigationReason: string;
  notes: string;
  location: InvestigationLocation;
  weather: InvestigationWeather;
  moon: InvestigationMoon;
  observedAt: string;
}

const ACTIVE_KEY = 'paranormal.activeInvestigation';
const HISTORY_KEY = 'paranormal.investigationHistory';

@Injectable({
  providedIn: 'root'
})
export class InvestigationStore {
  private static readonly LOG = '[Paranormal][Store]';

  // Wrap the boot reads — if they throw synchronously the entire app fails to
  // bootstrap with no recovery path. Better to start empty than to brick boot.
  private readonly activeSignal = signal<InvestigationRecord | null>(this.safeReadActive());
  private readonly historySignal = signal<InvestigationRecord[]>(this.safeReadHistory());
  private readonly persistErrorSig = signal<string>('');
  // When true, mutations skip persist() — used during bulk import so we don't
  // re-stringify the entire history once per restored investigation.
  private persistSuspended = false;

  readonly activeInvestigation = this.activeSignal.asReadonly();
  readonly history = this.historySignal.asReadonly();

  /**
   * Last persistence error (e.g. localStorage quota exceeded). Empty string when healthy.
   * Pages can read this to show a banner so the user knows their data isn't being saved.
   */
  readonly persistError = this.persistErrorSig.asReadonly();

  startInvestigation(draft: InvestigationDraft): InvestigationRecord {
    const record: InvestigationRecord = {
      id: createEvidenceId(),
      status: 'active',
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      locationTitle: draft.locationTitle.trim(),
      investigationReason: draft.investigationReason.trim(),
      notes: draft.notes.trim(),
      location: draft.location,
      weather: draft.weather,
      moon: draft.moon,
      observedAt: draft.observedAt,
      evidence: []
    };

    this.activeSignal.set(record);
    this.historySignal.update((history) => [record, ...history]);
    this.persist();
    return record;
  }

  getById(id: string): InvestigationRecord | null {
    return this.historySignal().find((record) => record.id === id) ?? null;
  }

  appendEvidenceToActive(evidence: Evidence): InvestigationRecord | null {
    const active = this.activeSignal();
    if (!active) {
      return null;
    }
    return this.appendEvidenceTo(active.id, evidence);
  }

  /**
   * Append evidence to a specific investigation by ID, regardless of whether
   * it's the currently-active one. Used by long-running captures (audio recordings)
   * that must attach to the investigation that was active when capture *started*,
   * not whatever might be active when capture finishes.
   */
  appendEvidenceTo(investigationId: string, evidence: Evidence): InvestigationRecord | null {
    let updated: InvestigationRecord | null = null;
    this.historySignal.update((history) =>
      history.map((item) => {
        if (item.id !== investigationId) return item;
        const next: InvestigationRecord = {
          ...item,
          evidence: [...(item.evidence ?? []), evidence]
        };
        updated = next;
        return next;
      })
    );
    if (updated && this.activeSignal()?.id === investigationId) {
      this.activeSignal.set(updated);
    }
    if (updated) {
      this.persist();
    }
    return updated;
  }

  removeEvidenceFromActive(evidenceId: string): InvestigationRecord | null {
    const active = this.activeSignal();
    if (!active) {
      return null;
    }
    const updated: InvestigationRecord = {
      ...active,
      evidence: (active.evidence ?? []).filter((e) => e.id !== evidenceId)
    };
    this.activeSignal.set(updated);
    this.historySignal.update((history) =>
      history.map((item) => (item.id === updated.id ? updated : item))
    );
    this.persist();
    return updated;
  }

  removeEvidence(investigationId: string, evidenceId: string): InvestigationRecord | null {
    let updated: InvestigationRecord | null = null;
    this.historySignal.update((history) =>
      history.map((item) => {
        if (item.id !== investigationId) return item;
        const next: InvestigationRecord = {
          ...item,
          evidence: (item.evidence ?? []).filter((e) => e.id !== evidenceId)
        };
        updated = next;
        return next;
      })
    );
    if (updated && this.activeSignal()?.id === investigationId) {
      this.activeSignal.set(updated);
    }
    this.persist();
    return updated;
  }

  updateInvestigation(
    id: string,
    updates: Partial<Pick<InvestigationRecord, 'locationTitle' | 'investigationReason' | 'notes'>>
  ): InvestigationRecord | null {
    let updated: InvestigationRecord | null = null;
    this.historySignal.update((history) =>
      history.map((item) => {
        if (item.id !== id) return item;
        const next: InvestigationRecord = {
          ...item,
          locationTitle: updates.locationTitle !== undefined ? updates.locationTitle.trim() : item.locationTitle,
          investigationReason:
            updates.investigationReason !== undefined ? updates.investigationReason.trim() : item.investigationReason,
          notes: updates.notes !== undefined ? updates.notes.trim() : item.notes
        };
        updated = next;
        return next;
      })
    );
    if (updated && this.activeSignal()?.id === id) {
      this.activeSignal.set(updated);
    }
    this.persist();
    return updated;
  }

  /**
   * Restore an investigation from a backup. Idempotent on ID — if the record
   * is already present we skip rather than duplicate. Returns whether the
   * record was newly added.
   */
  importInvestigation(record: InvestigationRecord): boolean {
    const normalized = this.normalize(record);
    let added = false;
    this.historySignal.update((history) => {
      if (history.some((r) => r.id === normalized.id)) {
        return history;
      }
      added = true;
      // Sort newest-first by startedAt as we insert.
      const merged = [normalized, ...history];
      merged.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return merged;
    });
    if (added) this.persist();
    return added;
  }

  /**
   * Run a callback that may make many mutations and persist only once at the
   * end. Used by BackupService.importBackup to avoid N localStorage writes
   * for an N-record import.
   */
  withBatchedPersist<T>(fn: () => T): T {
    const wasSuspended = this.persistSuspended;
    this.persistSuspended = true;
    try {
      return fn();
    } finally {
      this.persistSuspended = wasSuspended;
      if (!wasSuspended) {
        this.persist();
      }
    }
  }

  deleteInvestigation(id: string): InvestigationRecord | null {
    const record = this.historySignal().find((r) => r.id === id) ?? null;
    this.historySignal.update((history) => history.filter((r) => r.id !== id));
    if (this.activeSignal()?.id === id) {
      this.activeSignal.set(null);
    }
    this.persist();
    return record;
  }

  resumeInvestigation(id: string): { record: InvestigationRecord | null; reason?: 'already-active' | 'not-found' } {
    if (this.activeSignal() !== null) {
      return { record: null, reason: 'already-active' };
    }
    const existing = this.historySignal().find((r) => r.id === id);
    if (!existing) {
      return { record: null, reason: 'not-found' };
    }
    const resumed: InvestigationRecord = {
      ...existing,
      status: 'active',
      stoppedAt: null
    };
    this.activeSignal.set(resumed);
    this.historySignal.update((history) =>
      history.map((item) => (item.id === id ? resumed : item))
    );
    this.persist();
    return { record: resumed };
  }

  stopActiveInvestigation(): InvestigationRecord | null {
    const active = this.activeSignal();
    if (!active) {
      return null;
    }

    const stopped: InvestigationRecord = {
      ...active,
      status: 'stopped',
      stoppedAt: new Date().toISOString()
    };

    this.activeSignal.set(null);
    this.historySignal.update((history) =>
      history.map((item) => (item.id === stopped.id ? stopped : item))
    );
    this.persist();
    return stopped;
  }

  private persist(): void {
    if (this.persistSuspended) return;
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      const active = this.activeSignal();
      if (active) {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
      } else {
        localStorage.removeItem(ACTIVE_KEY);
      }
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.historySignal()));
      if (this.persistErrorSig()) {
        // Recovered from a previous failure — clear the error.
        this.persistErrorSig.set('');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${InvestigationStore.LOG} persist failed: ${message}`);
      // QuotaExceededError comes through here — surface to the UI so the user
      // knows new evidence isn't being saved (they should download/clear old).
      this.persistErrorSig.set(
        err instanceof DOMException && err.name === 'QuotaExceededError'
          ? 'Storage is full. Download or delete old investigations to free up space.'
          : `Couldn't save changes: ${message}`
      );
    }
  }

  private safeReadActive(): InvestigationRecord | null {
    try {
      return this.readActive();
    } catch (err) {
      console.error(`${InvestigationStore.LOG} safeReadActive caught`, err);
      return null;
    }
  }

  private safeReadHistory(): InvestigationRecord[] {
    try {
      return this.readHistory();
    } catch (err) {
      console.error(`${InvestigationStore.LOG} safeReadHistory caught`, err);
      return [];
    }
  }

  private readActive(): InvestigationRecord | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const stored = localStorage.getItem(ACTIVE_KEY);
    if (!stored) {
      return null;
    }
    try {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return null;
      return this.normalize(parsed);
    } catch (err) {
      console.error(`${InvestigationStore.LOG} readActive parse failed`, err);
      return null;
    }
  }

  private readHistory(): InvestigationRecord[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    const stored = localStorage.getItem(HISTORY_KEY);
    if (!stored) {
      return [];
    }
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((r) => this.normalize(r));
    } catch (err) {
      console.error(`${InvestigationStore.LOG} readHistory parse failed`, err);
      return [];
    }
  }

  /**
   * Defensive normalisation — never trust localStorage payload shape because
   * the schema may have been written by an older version of the app.
   */
  private normalize(raw: unknown): InvestigationRecord {
    const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    return {
      id: typeof r['id'] === 'string' ? r['id'] as string : createEvidenceId(),
      status: r['status'] === 'active' ? 'active' : 'stopped',
      startedAt: typeof r['startedAt'] === 'string' ? r['startedAt'] as string : new Date().toISOString(),
      stoppedAt: typeof r['stoppedAt'] === 'string' ? r['stoppedAt'] as string : null,
      locationTitle: typeof r['locationTitle'] === 'string' ? r['locationTitle'] as string : '',
      investigationReason: typeof r['investigationReason'] === 'string' ? r['investigationReason'] as string : '',
      notes: typeof r['notes'] === 'string' ? r['notes'] as string : '',
      location: (r['location'] && typeof r['location'] === 'object')
        ? r['location'] as InvestigationLocation
        : { latitude: 0, longitude: 0, accuracyMeters: null, altitudeMeters: null },
      weather: (r['weather'] && typeof r['weather'] === 'object')
        ? r['weather'] as InvestigationWeather
        : { temperatureC: null, humidityPct: null, windSpeedKph: null, weatherCode: null, weatherLabel: '', observedAt: '' },
      moon: (r['moon'] && typeof r['moon'] === 'object')
        ? r['moon'] as InvestigationMoon
        : { phaseName: 'Unknown', illuminationPct: 0, ageDays: 0 },
      observedAt: typeof r['observedAt'] === 'string' ? r['observedAt'] as string : new Date().toISOString(),
      evidence: this.normalizeEvidence(r['evidence'])
    };
  }

  /**
   * Validate every evidence entry shape before letting it into the store.
   * Critical for imports — a hand-edited backup could contain a `filePath`
   * pointing at a sensitive file outside our sandbox, which would then be
   * rendered as `<img>`/`<audio>`/`<video>` via Capacitor.convertFileSrc.
   * Reject unknown types and malformed payloads outright.
   */
  private normalizeEvidence(raw: unknown): Evidence[] {
    if (!Array.isArray(raw)) return [];
    const out: Evidence[] = [];
    for (const item of raw) {
      const e = this.validateEvidenceItem(item);
      if (e) out.push(e);
    }
    return out;
  }

  private validateEvidenceItem(raw: unknown): Evidence | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r['id'] !== 'string' || typeof r['capturedAt'] !== 'string') return null;
    const type = r['type'];
    switch (type) {
      case 'emf':
        if (typeof r['magnitudeMicroT'] !== 'number') return null;
        if (typeof r['baselineMicroT'] !== 'number') return null;
        if (typeof r['deviationMicroT'] !== 'number') return null;
        if (typeof r['bin'] !== 'number') return null;
        return raw as Evidence;
      case 'vibration':
        if (typeof r['magnitudeMs2'] !== 'number') return null;
        if (typeof r['peakSinceCalibrationMs2'] !== 'number') return null;
        if (typeof r['bin'] !== 'number') return null;
        return raw as Evidence;
      case 'field-note':
        if (typeof r['text'] !== 'string') return null;
        return raw as Evidence;
      case 'evp':
      case 'photo':
      case 'video':
        if (!this.isSafeMediaPath(r['filePath'])) return null;
        if (typeof r['sizeBytes'] !== 'number') return null;
        if (type !== 'photo' && typeof r['durationMs'] !== 'number') return null;
        return raw as Evidence;
      default:
        return null;
    }
  }

  /**
   * Reject media paths that don't live in our app's private files dir.
   * This is the import-time guard against hand-edited backups that point
   * filePath at e.g. /etc/passwd or another app's data — those would otherwise
   * be served via Capacitor.convertFileSrc and rendered in an <img>/<audio>/<video>.
   */
  private isSafeMediaPath(path: unknown): path is string {
    if (typeof path !== 'string' || path.length === 0) return false;
    // Match /data/data/<package>/files/{photos|videos|evp}/<basename>
    // Both during normal use and after restore, paths land under one of these.
    return /\/files\/(photos|videos|evp)\/[^/]+$/.test(path);
  }
}
