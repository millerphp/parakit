/**
 * Cross-cutting helpers reused by every evidence page and the detail/history
 * pages. Keep this dependency-free so it can be imported anywhere.
 */

export function createEvidenceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `evd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '0:00';
  const sec = Math.round(ms / 1000);
  const mm = Math.floor(sec / 60);
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function formatHms(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
