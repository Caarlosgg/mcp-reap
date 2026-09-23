// Logica pura: recibe el snapshot de procesos ya normalizado (ver
// lib/processes/index.js) y decide cuales estan huerfanos. No hace ningun
// syscall aqui para poder testearla sin depender del SO real.

/**
 * Un proceso se considera huerfano si:
 *   1. Su ppid no corresponde a ningun proceso vivo ("padre ausente"), o
 *   2. Su ppid es 0/1 (init/kernel en Unix; no hay padre "de usuario"
 *      real), o
 *   3. Su padre es el manager systemd --user del usuario (Linux con
 *      systemd --user: `loginctl enable-linger` u otras rutas dejan al
 *      manager vivo despues de que termine la sesion, y reparenta a el
 *      cualquier proceso cuyo padre original muere sin systemd de por
 *      medio. Ese ppid es "normal" -existe y arranco antes- por lo que
 *      las reglas 1 y 2 no lo detectan; hace falta la marca explicita
 *      `isSystemdUserManager` puesta por lib/processes/linux.js), o
 *   4. Existe un proceso con ese pid, pero empezo a correr DESPUES que el
 *      hijo ("padre-impostor"): el PID del padre original fue reciclado
 *      por el SO y ahora lo ocupa un proceso distinto que no tiene
 *      relacion con el hijo. Sin esta comprobacion, un huerfano real se
 *      reportaria como "sano" solo porque su ppid numerico coincide por
 *      casualidad con un proceso vivo.
 *
 * El propio manager systemd --user esta exento de las cuatro reglas: es
 * habitual que su ppid sea 1 (la regla 2 lo marcaria como huerfano) o que
 * su padre de lanzamiento ya no exista (regla 1) sin que eso signifique
 * que deba matarse -es la sesion de usuario entera la que depende de el-.
 *
 * @param {{ pid: number, ppid: number, startedAtMs: number | null, isSystemdUserManager?: boolean }} record
 * @param {Map<number, { pid: number, startedAtMs: number | null, isSystemdUserManager?: boolean }>} byPid
 * @returns {{ isOrphan: boolean, reason: string | null }}
 */
export function evaluateOrphan(record, byPid) {
  if (record.isSystemdUserManager) {
    return { isOrphan: false, reason: null };
  }

  if (record.ppid <= 1) {
    return { isOrphan: true, reason: 'reparentado a init/sistema' };
  }

  const parent = byPid.get(record.ppid);

  if (!parent) {
    return { isOrphan: true, reason: 'padre ausente' };
  }

  if (parent.isSystemdUserManager) {
    return { isOrphan: true, reason: 'reparentado al manager systemd --user' };
  }

  if (
    record.startedAtMs != null &&
    parent.startedAtMs != null &&
    parent.startedAtMs > record.startedAtMs
  ) {
    return { isOrphan: true, reason: 'pid del padre reciclado por otro proceso' };
  }

  return { isOrphan: false, reason: null };
}

/**
 * @param {Array<{ pid: number, ppid: number, startedAtMs: number | null }>} records
 * @returns {Array<Record & { isOrphan: boolean, orphanReason: string | null }>}
 */
export function findOrphans(records) {
  const byPid = new Map(records.map((record) => [record.pid, record]));

  return records
    .map((record) => {
      const { isOrphan, reason } = evaluateOrphan(record, byPid);
      return { ...record, isOrphan, orphanReason: reason };
    })
    .filter((record) => record.isOrphan);
}
