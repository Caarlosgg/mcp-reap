import { listProcesses } from '../lib/processes/index.js';
import { findOrphans } from '../lib/orphan.js';
import { identifyTool } from '../lib/signatures.js';
import { formatBytes, formatDuration, truncate } from '../lib/format.js';

/**
 * Cruza huerfanos detectados con firmas de herramientas conocidas.
 * Solo reportamos huerfanos que matchean una firma: en cualquier sistema
 * hay procesos huerfanos legitimos y ajenos (shells, daemons, etc.) que no
 * tienen nada que ver con herramientas de IA, y listarlos todos seria
 * ruido que no cumple el proposito de esta herramienta.
 *
 * `processSource` es inyectable (por defecto, el listado real del SO) para
 * poder correr exactamente la misma logica de deteccion/atribucion sobre
 * un snapshot simulado, tanto en tests como en `--demo`, sin abrir una
 * ruta de codigo paralela que pueda desincronizarse del scan real.
 *
 * @param {{ processSource?: () => Promise<Array> | Array }} [options]
 * @returns {Promise<Array>}
 */
export async function scan({ processSource = listProcesses } = {}) {
  const processes = await processSource();
  const orphans = findOrphans(processes);
  const now = Date.now();

  return orphans
    .map((orphan) => {
      const match = identifyTool(orphan);
      if (!match) return null;

      const elapsedSec =
        orphan.startedAtMs != null ? (now - orphan.startedAtMs) / 1000 : null;

      return {
        pid: orphan.pid,
        ppid: orphan.ppid,
        tool: match.tool,
        toolLabel: match.label,
        name: orphan.name,
        cmd: orphan.cmd,
        rssKB: orphan.rssKB,
        elapsedSec,
        orphanReason: orphan.orphanReason,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.elapsedSec ?? 0) - (a.elapsedSec ?? 0));
}

export function printReport(results, { json = false } = {}) {
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log('No orphaned processes from known AI tools were found.');
    return;
  }

  const headers = ['PID', 'TOOL', 'NAME', 'MEMORY', 'UPTIME', 'COMMAND'];
  const rows = results.map((r) => [
    String(r.pid),
    r.toolLabel,
    r.name,
    formatBytes(r.rssKB != null ? r.rssKB * 1024 : null),
    formatDuration(r.elapsedSec),
    truncate(r.cmd, 60),
  ]);

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length)),
  );

  const printRow = (cols) =>
    console.log(cols.map((col, i) => col.padEnd(widths[i])).join('  '));

  printRow(headers);
  printRow(widths.map((w) => '-'.repeat(w)));
  for (const row of rows) printRow(row);

  console.log(
    `\n${results.length} orphaned process(es) found. ` +
      'Ran in read-only mode: no process was killed or modified.',
  );
}
