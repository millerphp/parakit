import { Evidence, InvestigationRecord } from '../investigation.store';
import { formatBytes, formatDateTime, formatDuration } from '../shared/formatters';

export function buildInvestigationMarkdown(record: InvestigationRecord): string {
  const lines: string[] = [];
  const title = record.locationTitle?.trim() || 'Untitled investigation';
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**Started:** ${formatDateTime(record.startedAt)}`);
  if (record.stoppedAt) {
    lines.push(`**Stopped:** ${formatDateTime(record.stoppedAt)}`);
    lines.push(
      `**Duration:** ${formatDuration(new Date(record.stoppedAt).getTime() - new Date(record.startedAt).getTime())}`
    );
  }
  lines.push(`**Status:** ${record.status === 'active' ? 'Active' : 'Stopped'}`);
  lines.push('');

  if (record.investigationReason?.trim()) {
    lines.push('## Reason');
    lines.push(record.investigationReason);
    lines.push('');
  }

  lines.push('## Environment');
  const { latitude, longitude, accuracyMeters, altitudeMeters } = record.location;
  lines.push(
    `- **GPS:** ${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accuracyMeters !== null ? ` (±${Math.round(accuracyMeters)} m)` : ''}`
  );
  if (altitudeMeters !== null) lines.push(`- **Altitude:** ${Math.round(altitudeMeters)} m`);
  lines.push(`- **Weather:** ${record.weather.weatherLabel || 'Unavailable'}`);
  if (record.weather.temperatureC !== null) lines.push(`- **Temperature:** ${record.weather.temperatureC.toFixed(1)} °C`);
  if (record.weather.humidityPct !== null) lines.push(`- **Humidity:** ${record.weather.humidityPct}%`);
  if (record.weather.windSpeedKph !== null) lines.push(`- **Wind:** ${Math.round(record.weather.windSpeedKph)} kph`);
  lines.push(`- **Moon:** ${record.moon.phaseName} · ${record.moon.illuminationPct}% lit · age ${record.moon.ageDays}d`);
  lines.push('');

  if (record.evidence && record.evidence.length > 0) {
    lines.push(`## Evidence (${record.evidence.length})`);
    record.evidence.forEach((e) => {
      lines.push(`- ${formatDateTime(e.capturedAt)} — ${formatEvidenceLine(e)}`);
    });
    lines.push('');
  }

  if (record.notes?.trim()) {
    lines.push('## Field notes');
    lines.push(record.notes);
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function buildEvidenceMarkdown(record: InvestigationRecord, evidence: Evidence): string {
  const title = record.locationTitle?.trim() || 'Investigation';
  const lines = [
    `Evidence from ${title}`,
    formatDateTime(evidence.capturedAt),
    '',
    formatEvidenceLine(evidence)
  ];
  if (evidence.type === 'field-note') {
    lines.push('', evidence.text);
  }
  return lines.join('\n');
}

export function formatEvidenceLine(e: Evidence): string {
  switch (e.type) {
    case 'emf':
      return `EMF · bin ${e.bin} · ${e.magnitudeMicroT.toFixed(1)} μT (Δ ${e.deviationMicroT.toFixed(1)})${e.note ? ` [${e.note}]` : ''}`;
    case 'vibration':
      return `Vibration · bin ${e.bin} · ${e.magnitudeMs2.toFixed(2)} m/s² (peak ${e.peakSinceCalibrationMs2.toFixed(2)})${e.note ? ` [${e.note}]` : ''}`;
    case 'field-note':
      return `Note: ${e.text}`;
    case 'evp':
      return `Sound recording · ${formatDuration(e.durationMs)}`;
    case 'photo':
      return `Photo · ${formatBytes(e.sizeBytes)}`;
    case 'video':
      return `Video · ${formatDuration(e.durationMs)} · ${formatBytes(e.sizeBytes)}`;
  }
}

export function sanitizeForFilesystem(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 50) || 'investigation';
}

export function investigationFolderName(record: InvestigationRecord): string {
  const title = sanitizeForFilesystem(record.locationTitle || 'investigation');
  return `${title}-${record.id.slice(0, 8)}`;
}

export function extensionFor(filePath: string, fallback: string): string {
  const idx = filePath.lastIndexOf('.');
  if (idx < 0 || idx === filePath.length - 1) return fallback;
  return filePath.slice(idx + 1);
}

