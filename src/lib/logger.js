// Log de auditoria persistente para `clean`. Cada accion (SIGTERM, SIGKILL,
// omision, resultado) se anexa como una linea JSON (JSONL) en
// ~/.mzg/clean.log. JSONL y no un JSON unico para poder anexar sin releer
// ni reescribir el fichero entero, y para que sea grep-eable.
//
// Matar procesos es destructivo e irreversible: dejar rastro de que se
// mato, cuando y como no es un extra, es parte de poder confiar en la
// herramienta.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export function defaultLogPath() {
  return join(homedir(), '.mzg', 'clean.log');
}

/**
 * Logger que anexa a fichero. Crea ~/.mzg/ si no existe.
 * @param {string} [logPath]
 */
export function createFileLogger(logPath = defaultLogPath()) {
  mkdirSync(dirname(logPath), { recursive: true });
  return {
    path: logPath,
    log(entry) {
      const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
      appendFileSync(logPath, `${line}\n`);
    },
  };
}

/**
 * Logger en memoria: usado por los tests y por `--demo` para no escribir
 * en el disco real del usuario.
 */
export function createMemoryLogger() {
  const entries = [];
  return {
    path: null,
    entries,
    log(entry) {
      entries.push({ ts: new Date().toISOString(), ...entry });
    },
  };
}
