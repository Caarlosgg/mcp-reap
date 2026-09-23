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

function readProcStatus(pid) {
  // VmRSS y Uid viven en el mismo fichero: una sola lectura para ambos en
  // vez de abrir /proc/[pid]/status dos veces por proceso.
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const rssMatch = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
    const uidMatch = status.match(/^Uid:\s+(\d+)/m);
    return {
      rssKB: rssMatch ? Number(rssMatch[1]) : null,
      // Primer numero de la linea Uid: es el UID real (los otros tres son
      // efectivo/guardado/fs), el que nos interesa para comparar con
      // process.getuid().
      uid: uidMatch ? Number(uidMatch[1]) : null,
    };
  } catch {
    return { rssKB: null, uid: null };
  }
}

// systemd --user no aparece por su ruta completa en `comm` (se trunca al
// basename "systemd"), asi que distinguirlo del systemd de sistema (PID 1)
// requiere mirar el argumento --user en cmdline, no solo el nombre.
function looksLikeSystemdUserManager(name, cmd) {
  return name === 'systemd' && /(^|\s)--user(\s|$)/.test(cmd);
}

export function listProcesses() {
  const bootTimeMs = readBootTimeMs();
  // Solo nos interesan managers systemd --user del usuario que ejecuta
  // mcp-reap: uno de otro usuario en la misma maquina no es "nuestro"
  // arbol de procesos y no deberiamos tocarlo.
  const currentUid = process.getuid();
  const pids = readdirSync('/proc').filter((entry) => /^\d+$/.test(entry));
  const records = [];

  for (const pidStr of pids) {
    const pid = Number(pidStr);
    try {
      const rawStat = readFileSync(join('/proc', pidStr, 'stat'), 'utf8');
      const { name, ppid, starttimeTicks } = parseStat(rawStat);
      const startedAtMs =
        bootTimeMs != null ? bootTimeMs + (starttimeTicks / CLK_TCK) * 1000 : null;
      const cmd = readCmdline(pid) || name;
      const { rssKB, uid } = readProcStatus(pid);

      records.push({
        pid,
        ppid,
        name,
        cmd,
        rssKB,
        startedAtMs,
        isSystemdUserManager: uid === currentUid && looksLikeSystemdUserManager(name, cmd),
      });
    } catch {
      // El proceso murio entre el readdir y la lectura de sus archivos:
      // condicion de carrera normal en /proc, simplemente lo omitimos.
    }
  }

  return records;
}
