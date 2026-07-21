export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '?';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)}${units[unitIndex]}`;
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0) return '?';
  const s = Math.floor(seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * Renderiza una tabla de texto con columnas alineadas. Devuelve el string
 * completo (no imprime) para que quien llame decida el destino.
 * @param {string[]} headers
 * @param {Array<Array<string | number>>} rows
 */
export function renderTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => String(row[i]).length)),
  );
  const line = (cols) =>
    cols.map((col, i) => String(col).padEnd(widths[i])).join('  ');

  const out = [line(headers), line(widths.map((w) => '-'.repeat(w)))];
  for (const row of rows) out.push(line(row));
  return out.join('\n');
}
