// Capa que efectivamente termina procesos. Todo el contacto con el SO
// (mandar senales, comprobar si un PID sigue vivo, dormir, leer el reloj)
// esta detras de un objeto `control` inyectable, para que los tests y el
// modo --demo corran esta misma logica sin llamar nunca a process.kill /
// taskkill reales.
//
// La INTERFAZ de `control` es la misma en todos los SO: kill(pid, signal)
// con signal 'SIGTERM' (suave) o 'SIGKILL' (forzado). Quien la usa (reap,
// clean) no sabe en que SO esta; cada plataforma traduce esa intencion a
// su mecanismo real.
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

function isAlive(pid) {
  try {
    // La senal 0 no envia nada: solo comprueba existencia/permisos. Es
    // valida tambien en Windows (Node la mapea a comprobar el handle).
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = el proceso existe pero no es nuestro; sigue vivo.
    return err.code === 'EPERM';
  }
}

// Unix: SIGTERM/SIGKILL reales via process.kill. SIGTERM deja que el
// proceso limpie sus recursos; SIGKILL lo mata en seco. La escalada
// suave->forzada de reap es exactamente lo que estos dos permiten.
function unixKill(pid, signal) {
  process.kill(pid, signal);
}

// Ejecuta taskkill de verdad. Aislado para poder inyectar un doble en los
// tests y no lanzar taskkill real. Lanza si el exit code no es 0.
function runTaskkill(pid, force) {
  const args = force ? ['/PID', String(pid), '/F'] : ['/PID', String(pid)];
  execFileSync('taskkill', args, { stdio: 'pipe', windowsHide: true });
}

// Windows: process.kill(pid, 'SIGTERM') NO es una terminacion suave: Node
// llama a TerminateProcess, que es un kill forzado inmediato igual que
// 'SIGKILL' (confirmado en la doc de Node). Es decir, con process.kill la
// escalada suave->forzada no existe en Windows.
//
// taskkill si distingue: sin /F pide un cierre ORDENADO (postea WM_CLOSE /
// senal de cierre); con /F es TerminateProcess forzado. Traducimos:
//   'SIGTERM' -> taskkill /PID <pid>        (suave)
//   'SIGKILL' -> taskkill /PID <pid> /F     (forzado)
//
// Matiz clave: el cierre suave NO se puede entregar a un proceso de
// consola sin ventana (taskkill responde "can only be terminated
// forcefully" y sale != 0). Eso NO es un fallo fatal: es justo el
// analogo a "SIGTERM ignorado". Nos lo tragamos y devolvemos como si la
// senal se hubiera enviado, para que reap espere el timeout y escale a
// /F. Solo tratamos como fatal el fallo del intento forzado.
export function makeWindowsKill({ run = runTaskkill, isAlive: alive = isAlive } = {}) {
  return (pid, signal) => {
    const force = signal === 'SIGKILL';
    try {
      run(pid, force);
    } catch (err) {
      if (!alive(pid)) {
        // taskkill fallo porque el proceso ya no existe: equivalente al
        // ESRCH de Unix, para que reap lo cuente como "ya-muerto".
        const notFound = new Error(`proceso ${pid} no encontrado`);
        notFound.code = 'ESRCH';
        throw notFound;
      }
      // Sigue vivo. El cierre suave no entregable es esperable: dejamos
      // que reap escale a /F. Un fallo con /F ya es un error real
      // (permisos, proceso protegido, requiere elevacion...).
      if (!force) return;
      throw err;
    }
  };
}

// Control real contra el SO, con el kill adecuado a la plataforma.
export const realControl = {
  kill: process.platform === 'win32' ? makeWindowsKill() : unixKill,
  isAlive,
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
