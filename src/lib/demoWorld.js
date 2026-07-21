// Mundo simulado para `mzg clean --demo`. Devuelve un `processSource` y un
// `control` que comparten estado en memoria, de modo que `clean` corre su
// pipeline real (revalidacion, SIGTERM->SIGKILL, log) contra procesos de
// mentira.
//
// SEGURIDAD: este control NUNCA llama a process.kill real. Es deliberado:
// los PID del snapshot de demo (8123, 8500, 9001...) podrian coincidir con
// procesos reales de la maquina, y un `clean --demo` jamas debe poder
// matar algo de verdad.
import { buildDemoSnapshot } from './demoData.js';

/**
 * @param {{ stubbornPids?: number[] }} [opts] PIDs que ignoran SIGTERM y
 *   solo mueren con SIGKILL, para demostrar la escalada.
 */
export function createDemoWorld({ stubbornPids = [] } = {}) {
  let live = buildDemoSnapshot();
  const stubborn = new Set(stubbornPids);

  // Reloj virtual: el tiempo solo avanza cuando el pipeline "duerme", asi
  // la espera de 10s del timeout se resuelve al instante en la demo sin
  // dejar de ejercitar la logica de deadline.
  let clock = Date.now();

  const control = {
    kill(pid, signal) {
      if (!live.some((p) => p.pid === pid)) {
        const err = new Error('no such process');
        err.code = 'ESRCH';
        throw err;
      }
      if (signal === 'SIGKILL' || !stubborn.has(pid)) {
        live = live.filter((p) => p.pid !== pid);
      }
      // SIGTERM sobre un PID stubborn: no muere (simula proceso que
      // ignora la senal), forzando la escalada a SIGKILL.
    },
    isAlive(pid) {
      return live.some((p) => p.pid === pid);
    },
    async sleep(ms) {
      clock += ms;
    },
    now() {
      return clock;
    },
  };

  const processSource = () => live.map((p) => ({ ...p }));

  return { processSource, control };
}
