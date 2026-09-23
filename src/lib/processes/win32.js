// Windows no tiene /proc ni `ps`. Usamos powershell.exe (viene con el
// sistema, no es una dependencia npm) para consultar Win32_Process via
// CIM, que a diferencia de `tasklist`/`wmic` (este ultimo deprecado desde
// Windows 10) nos da ParentProcessId y CreationDate como datos
// estructurados, sin tener que parsear texto tabular de ancho fijo.
//
// CreationDate es un DateTime de CIM cuyo formato al serializarse con
// ConvertTo-Json varia segun la version de PowerShell: en Windows
// PowerShell 5.1 (la que trae el sistema por defecto y la que invocamos
// aqui via powershell.exe, no pwsh 7+) el string resultante no es ISO
// 8601 y `new Date()` sobre el da Invalid Date (verificado fallando en
// CI de windows-latest). Para no depender de ese formato ambiguo entre
// versiones, calculamos los milisegundos desde epoch Unix DENTRO del
// propio script de PowerShell (con [DateTimeOffset]...
// ToUnixTimeMilliseconds()) y serializamos ya un numero simple.
import { execFileSync } from 'node:child_process';

const SCRIPT =
  'Get-CimInstance Win32_Process | ' +
  'Select-Object ProcessId, ParentProcessId, Name, WorkingSetSize, CommandLine, ' +
  '@{Name="CreationDateMs"; Expression={ ' +
  'if ($_.CreationDate) { [long]([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } ' +
  'else { $null } ' +
  '}} | ' +
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

  return list.map((proc) => ({
    pid: proc.ProcessId,
    ppid: proc.ParentProcessId,
    name: proc.Name ?? '',
    cmd: proc.CommandLine ?? proc.Name ?? '',
    rssKB: proc.WorkingSetSize != null ? Math.round(proc.WorkingSetSize / 1024) : null,
    startedAtMs: proc.CreationDateMs ?? null,
  }));
}
