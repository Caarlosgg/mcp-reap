import { listProcesses } from '../lib/processes/index.js';
import { scan } from './scan.js';
import { isWhitelisted, DEFAULT_WHITELIST } from '../lib/whitelist.js';
import { realControl, revalidate, reap } from '../lib/reaper.js';
import { createFileLogger } from '../lib/logger.js';
import { formatBytes, formatDuration, truncate, renderTable } from '../lib/format.js';

/**
 * Detecta huerfanos (reusando la logica de scan) y, si `yes` es true, los
 * mata con SIGTERM->SIGKILL previa revalidacion. Por defecto (dry-run)
 * solo devuelve lo que haria.
 *
 * Todas las piezas con efecto (fuente de procesos, control del SO, logger)
 * son inyectables para poder testear sin matar nada real.
 *
 * @param {{
 *   processSource?: () => Promise<Array> | Array,
 *   control?: object,
 *   logger?: object,
 *   whitelist?: Array<string | RegExp>,
 *   timeoutMs?: number,
 *   yes?: boolean,
 * }} [options]
 */
export async function clean({
  processSource = listProcesses,
  control = realControl,
  logger,
  whitelist = DEFAULT_WHITELIST,
  timeoutMs = 10_000,
  yes = false,
} = {}) {
  // Un unico snapshot inicial: lo usamos tanto para detectar (via scan)
  // como para recuperar el startedAtMs baseline de cada objetivo, para que
  // ambos datos sean coherentes entre si.
  const snapshot = await processSource();
  const detected = await scan({ processSource: () => snapshot });
  const byPid = new Map(snapshot.map((r) => [r.pid, r]));

  // scan() no expone startedAtMs en su salida (y no lo tocamos); lo
  // recuperamos aqui del snapshot crudo para poder revalidar despues.
  const targets = detected.map((t) => ({
    ...t,
    startedAtMs: byPid.get(t.pid)?.startedAtMs ?? null,
  }));

  const whitelisted = targets.filter((t) => isWhitelisted(t, whitelist));
  const killTargets = targets.filter((t) => !isWhitelisted(t, whitelist));

  if (!yes) {
    return { dryRun: true, killTargets, whitelisted, results: [] };
  }

  if (killTargets.length === 0) {
    return { dryRun: false, killTargets, whitelisted, results: [], logPath: null };
  }

  const log = logger ?? createFileLogger();
  const results = [];

  for (const target of killTargets) {
    const check = await revalidate(target, processSource);
    if (!check.ok) {
      log.log({ event: 'omitido', pid: target.pid, name: target.name, reason: check.reason });
      results.push({ target, status: 'omitido', reason: check.reason });
      continue;
    }

    log.log({ event: 'objetivo', pid: target.pid, name: target.name, tool: target.tool });
    const { actions, killed, finalSignal } = await reap(target, { control, timeoutMs });
    for (const action of actions) {
      log.log({ event: 'senal', pid: target.pid, ...action });
    }
    log.log({
      event: 'resultado',
      pid: target.pid,
      name: target.name,
      status: killed ? 'muerto' : 'fallo',
      finalSignal: finalSignal ?? null,
    });

    results.push({
      target,
      status: killed ? 'muerto' : 'fallo',
      finalSignal: finalSignal ?? actions.at(-1)?.signal ?? null,
    });
  }

  return { dryRun: false, killTargets, whitelisted, results, logPath: log.path };
}

function targetRow(t) {
  return [
    String(t.pid),
    t.toolLabel,
    t.name,
    formatBytes(t.rssKB != null ? t.rssKB * 1024 : null),
    formatDuration(t.elapsedSec),
    truncate(t.cmd, 50),
  ];
}

export function printCleanReport(outcome, { json = false } = {}) {
  if (json) {
    console.log(JSON.stringify(outcome, null, 2));
    return;
  }

  const { dryRun, killTargets, whitelisted, results } = outcome;

  if (dryRun) {
    if (killTargets.length === 0) {
      console.log('No hay procesos huerfanos que limpiar.');
    } else {
      console.log('DRY-RUN: no se matara nada. Ejecuta con --yes para hacerlo.\n');
      console.log(
        renderTable(
          ['PID', 'HERRAMIENTA', 'NOMBRE', 'MEMORIA', 'TIEMPO ACTIVO', 'COMANDO'],
          killTargets.map(targetRow),
        ),
      );
      console.log(`\n${killTargets.length} proceso(s) se matarian con --yes.`);
    }
    if (whitelisted.length > 0) {
      console.log(`${whitelisted.length} protegido(s) por lista blanca (no se tocarian).`);
    }
    return;
  }

  if (results.length === 0) {
    console.log('No hubo procesos huerfanos que limpiar.');
    if (whitelisted.length > 0) {
      console.log(`${whitelisted.length} protegido(s) por lista blanca.`);
    }
    return;
  }

  const statusText = (r) => {
    if (r.status === 'muerto') return `muerto (${r.finalSignal})`;
    if (r.status === 'omitido') return `omitido: ${r.reason}`;
    return 'FALLO (sigue vivo)';
  };

  console.log(
    renderTable(
      ['PID', 'HERRAMIENTA', 'NOMBRE', 'TIEMPO ACTIVO', 'RESULTADO'],
      results.map((r) => [
        String(r.target.pid),
        r.target.toolLabel,
        r.target.name,
        formatDuration(r.target.elapsedSec),
        statusText(r),
      ]),
    ),
  );

  const killed = results.filter((r) => r.status === 'muerto').length;
  const skipped = results.filter((r) => r.status === 'omitido').length;
  const failed = results.filter((r) => r.status === 'fallo').length;

  console.log(
    `\n${killed} muerto(s), ${skipped} omitido(s), ${failed} fallido(s).` +
      (whitelisted.length > 0 ? ` ${whitelisted.length} protegido(s) por lista blanca.` : ''),
  );
  if (outcome.logPath) {
    console.log(`Log: ${outcome.logPath}`);
  }
}
