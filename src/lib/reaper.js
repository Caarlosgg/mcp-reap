// Capa que efectivamente termina procesos. Todo el contacto con el SO
// (mandar senales, comprobar si un PID sigue vivo, dormir, leer el reloj)
// esta detras de un objeto `control` inyectable, para que los tests y el
// modo --demo corran esta misma logica sin llamar nunca a process.kill
// real.
import { setTimeout as sleep } from 'node:timers/promises';

// Control real contra el SO.
//
// Nota Windows: no existe SIGTERM real; process.kill(pid, 'SIGTERM') llama
// a TerminateProcess igual que SIGKILL, o sea que la "terminacion suave"
// no es tan suave ahi. Mantenemos igual la escalada SIGTERM->espera->
// SIGKILL: en Unix es la diferencia entre dejar que el proceso limpie sus
// recursos y matarlo en seco, y en Windows simplemente el proceso ya
// habra muerto tras el primer intento (la espera termina de inmediato).
export const realControl = {
  kill(pid, signal) {
    process.kill(pid, signal);
  },
  isAlive(pid) {
    try {
      // La senal 0 no envia nada: solo comprueba existencia/permisos.
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // EPERM = el proceso existe pero no es nuestro; sigue vivo.
      return err.code === 'EPERM';
    }
  },
  async sleep(ms) {
    await sleep(ms);
  },
  now() {
    return Date.now();
  },
};

/**
 * Revalida, JUSTO antes de matar, que el objetivo detectado sigue siendo
 * el mismo proceso. Vuelve a pedir un snapshot fresco y compara:
 *   - que el PID siga existiendo, y
 *   - que su timestamp de arranque coincida con el que vimos al detectarlo.
 *
 * El segundo punto es el critico: entre el escaneo y el kill pudo pasar
 * tiempo, el huerfano pudo morir solo, y el SO pudo reasignar su PID a un
 * proceso nuevo y totalmente legitimo. Comprobar solo "el PID existe" nos
 * haria matar a ese inocente. El startedAtMs es la huella que distingue
 * "sigue siendo aquel proceso" de "es otro que heredo el numero".
 *
 * @param {{ pid: number, startedAtMs: number | null }} target
 * @param {() => Promise<Array> | Array} processSource
 */
export async function revalidate(target, processSource) {
  const snapshot = await processSource();
  const current = snapshot.find((p) => p.pid === target.pid);

  if (!current) {
    return { ok: false, reason: 'el proceso ya no existe' };
  }
  if (
    target.startedAtMs != null &&
    current.startedAtMs != null &&
    current.startedAtMs !== target.startedAtMs
  ) {
    return { ok: false, reason: 'PID reciclado por otro proceso distinto' };
  }
  return { ok: true, current };
}

/**
 * Termina un proceso: SIGTERM, espera hasta timeoutMs a que muera solo, y
 * solo si sigue vivo escala a SIGKILL.
 *
 * @param {{ pid: number }} target
 * @param {{ control: object, timeoutMs: number, pollMs?: number }} opts
 * @returns {Promise<{ actions: Array, killed: boolean, finalSignal?: string }>}
 */
export async function reap(target, { control, timeoutMs, pollMs = 500 }) {
  const { pid } = target;
  const actions = [];

  const send = (signal) => {
    try {
      control.kill(pid, signal);
      actions.push({ signal, result: 'enviado' });
      return true;
    } catch (err) {
      if (err.code === 'ESRCH') {
        // Murio entre la revalidacion y este kill: carrera esperable, no
        // es un fallo.
        actions.push({ signal, result: 'ya-muerto' });
        return false;
      }
      actions.push({ signal, result: `error:${err.code ?? err.message}` });
      return false;
    }
  };

  if (!send('SIGTERM')) {
    return { actions, killed: !control.isAlive(pid) };
  }

  const deadline = control.now() + timeoutMs;
  while (control.isAlive(pid) && control.now() < deadline) {
    await control.sleep(pollMs);
  }

  if (!control.isAlive(pid)) {
    return { actions, killed: true, finalSignal: 'SIGTERM' };
  }

  if (!send('SIGKILL')) {
    return { actions, killed: !control.isAlive(pid) };
  }
  await control.sleep(pollMs);
  return { actions, killed: !control.isAlive(pid), finalSignal: 'SIGKILL' };
}
