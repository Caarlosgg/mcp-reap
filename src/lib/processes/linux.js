// Linux: leemos /proc directamente en vez de invocar `ps`. Es mas rapido
// (sin spawnear un proceso extra), mas facil de parsear de forma robusta,
// y evita depender del formato de salida de `ps`, que varia entre
// distros/locales.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// El campo 22 de /proc/[pid]/stat es "starttime" en ticks de reloj desde
// el arranque del sistema. El tick estandar en Linux (USER_HZ) es 100 en
// la enorme mayoria de kernels x86/x86_64/arm de escritorio y servidor;
// no hay forma de leer sysconf(_SC_CLK_TCK) desde Node puro sin un modulo
// nativo, asi que lo asumimos fijo. Si algun dia corre en un kernel con
// HZ distinto, el "tiempo activo" reportado quedaria desfasado, pero el
// orden relativo de arranque (que es lo que usa la deteccion de huerfanos)
// se mantiene correcto porque el factor de escala es el mismo para todos
// los procesos.
const CLK_TCK = 100;

function readBootTimeMs() {
  const stat = readFileSync('/proc/stat', 'utf8');
  const match = stat.match(/^btime (\d+)/m);
  if (!match) return null;
  return Number(match[1]) * 1000;
}

function parseStat(raw) {
  // El nombre del proceso va entre parentesis y puede contener espacios o
  // parentesis anidados (ej. "(some (weird) name)"), asi que ubicamos el
  // primer '(' y el ULTIMO ')' para extraerlo, en vez de hacer split por
  // espacios directamente.
  const openIdx = raw.indexOf('(');
  const closeIdx = raw.lastIndexOf(')');
  const name = raw.slice(openIdx + 1, closeIdx);
  const rest = raw.slice(closeIdx + 2).split(' ');

  // rest[0] = state, rest[1] = ppid, ... rest[19] = starttime (offset por
  // los dos primeros campos ya consumidos: pid y comm).
  const ppid = Number(rest[1]);
  const starttimeTicks = Number(rest[19]);

  return { name, ppid, starttimeTicks };
}

function readCmdline(pid) {
  try {
    const raw = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return raw.split('\0').filter(Boolean).join(' ');
  } catch {
    return '';
  }
}

function readRssKB(pid) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export function listProcesses() {
  const bootTimeMs = readBootTimeMs();
  const pids = readdirSync('/proc').filter((entry) => /^\d+$/.test(entry));
  const records = [];

  for (const pidStr of pids) {
    const pid = Number(pidStr);
    try {
      const rawStat = readFileSync(join('/proc', pidStr, 'stat'), 'utf8');
      const { name, ppid, starttimeTicks } = parseStat(rawStat);
      const startedAtMs =
        bootTimeMs != null ? bootTimeMs + (starttimeTicks / CLK_TCK) * 1000 : null;

      records.push({
        pid,
        ppid,
        name,
        cmd: readCmdline(pid) || name,
        rssKB: readRssKB(pid),
        startedAtMs,
      });
    } catch {
      // El proceso murio entre el readdir y la lectura de sus archivos:
      // condicion de carrera normal en /proc, simplemente lo omitimos.
    }
  }

  return records;
}
