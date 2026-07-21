// macOS no tiene /proc, asi que dependemos de `ps` (viene preinstalado en
// el sistema, no es una dependencia externa nuestra). Pedimos "lstart" en
// vez de "etime" porque nos da una fecha/hora absoluta y legible por
// Date(), evitando tener que parsear el formato variable de etime
// ("mm:ss", "hh:mm:ss", "dd-hh:mm:ss").
//
// `ps -o` en BSD/macOS separa columnas por espacios, sin posibilidad de
// insertar un delimitador propio: si pedimos lstart y command en la misma
// pasada, sus espacios internos ("Mon Jul 21 10:00:00 2026", o cualquier
// argumento con espacios) hacen ambiguo el split. Por eso hacemos una
// pasada por columnas simples (sin espacios) y dos pasadas separadas
// donde el unico campo variable es el ultimo de la linea: todo lo que
// venga despues del pid es, sin ambiguedad, ese campo completo.
import { execFileSync } from 'node:child_process';

function runPs(args) {
  return execFileSync('ps', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
  });
}

function parsePidPrefixedLines(output) {
  const byPid = new Map();
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.indexOf(' ');
    const pid = Number(spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx));
    const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
    byPid.set(pid, rest);
  }
  return byPid;
}

export function listProcesses() {
  const base = runPs(['-axo', 'pid=,ppid=,rss=,comm=']);
  const lstartByPid = parsePidPrefixedLines(runPs(['-axo', 'pid=,lstart=']));
  const cmdByPid = parsePidPrefixedLines(runPs(['-axo', 'pid=,command=']));

  const records = [];

  for (const line of base.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // comm puede tener espacios (ej. "Google Chrome Helper (Renderer)"),
    // asi que solo los primeros 3 tokens son de ancho fijo; el resto de
    // la linea es el nombre completo.
    const [pidStr, ppidStr, rssStr, ...commParts] = trimmed.split(/\s+/);
    const comm = commParts.join(' ');
    const pid = Number(pidStr);

    const lstartStr = lstartByPid.get(pid) ?? '';
    const startedAt = new Date(lstartStr);

    records.push({
      pid,
      ppid: Number(ppidStr),
      name: (comm ?? '').split('/').pop(),
      cmd: cmdByPid.get(pid) || comm || '',
      rssKB: Number(rssStr),
      startedAtMs: Number.isNaN(startedAt.getTime()) ? null : startedAt.getTime(),
    });
  }

  return records;
}
