// Windows no tiene /proc ni `ps`. Usamos powershell.exe (viene con el
// sistema, no es una dependencia npm) para consultar Win32_Process via
// CIM, que a diferencia de `tasklist`/`wmic` (este ultimo deprecado desde
// Windows 10) nos da ParentProcessId y CreationDate como datos
// estructurados, sin tener que parsear texto tabular de ancho fijo.
import { execFileSync } from 'node:child_process';

const SCRIPT =
  'Get-CimInstance Win32_Process | ' +
  'Select-Object ProcessId, ParentProcessId, Name, WorkingSetSize, CreationDate, CommandLine | ' +
  'ConvertTo-Json -Compress';

export function listProcesses() {
  const output = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 },
  );

  const parsed = JSON.parse(output);
  // ConvertTo-Json devuelve un objeto (no array) si solo hay un proceso.
  const list = Array.isArray(parsed) ? parsed : [parsed];

  return list.map((proc) => {
    // CreationDate llega como string ISO 8601 (PowerShell 7+) gracias a
    // ConvertTo-Json; Date la parsea directamente.
    const startedAt = proc.CreationDate ? new Date(proc.CreationDate) : null;

    return {
      pid: proc.ProcessId,
      ppid: proc.ParentProcessId,
      name: proc.Name ?? '',
      cmd: proc.CommandLine ?? proc.Name ?? '',
      rssKB: proc.WorkingSetSize != null ? Math.round(proc.WorkingSetSize / 1024) : null,
      startedAtMs: startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt.getTime() : null,
    };
  });
}
