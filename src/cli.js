#!/usr/bin/env node
import { scan, printReport } from './commands/scan.js';
import { clean, printCleanReport } from './commands/clean.js';

function printUsage() {
  console.log(
    [
      'Uso:',
      '  mzg scan  [--json]',
      '  mzg clean [--yes] [--timeout=<segundos>] [--json]',
      '',
      'Por defecto clean es dry-run: muestra que mataria sin tocar nada.',
      'Anade --yes para matar de verdad (SIGTERM y, si no responde, SIGKILL).',
    ].join('\n'),
  );
}

function flagValue(args, name) {
  const prefix = `${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

async function main(argv) {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === 'scan') {
    const json = rest.includes('--json');
    const demo = rest.includes('--demo');

    let processSource;
    if (demo) {
      const { buildDemoSnapshot } = await import('./lib/demoData.js');
      processSource = () => buildDemoSnapshot();
      // Al stderr y no al stdout: para que `--demo --json` siga
      // produciendo stdout parseable, sin mezclar el aviso con los datos.
      console.error('[DEMO] Datos simulados, no se escaneo el sistema real.\n');
    }

    const results = await scan({ processSource });
    printReport(results, { json });
    return;
  }

  if (command === 'clean') {
    const json = rest.includes('--json');
    const yes = rest.includes('--yes');
    const demo = rest.includes('--demo');

    const timeoutSec = Number(flagValue(rest, '--timeout'));
    const timeoutMs = Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec * 1000 : 10_000;

    const options = { yes, timeoutMs };

    if (demo) {
      // Mundo simulado: control que NUNCA llama a process.kill real y
      // logger en memoria, para no tocar procesos ni escribir en ~/.mzg.
      // El PID 8500 (Cursor) ignora SIGTERM a proposito, para que se vea
      // la escalada a SIGKILL. Whitelist vacia a proposito: la demo debe
      // ser determinista e independiente del config real del usuario.
      const { createDemoWorld } = await import('./lib/demoWorld.js');
      const { createMemoryLogger } = await import('./lib/logger.js');
      const world = createDemoWorld({ stubbornPids: [8500] });
      options.processSource = world.processSource;
      options.control = world.control;
      options.logger = createMemoryLogger();
      console.error('[DEMO] Datos simulados; NO se toca ningun proceso real.\n');
    } else {
      // Camino real: la lista blanca sale de ~/.mzg/config.json (o vacia
      // si no existe / esta corrupto; loadWhitelist ya avisa por stderr).
      const { loadWhitelist } = await import('./lib/whitelist.js');
      options.whitelist = loadWhitelist();
    }

    const outcome = await clean(options);
    printCleanReport(outcome, { json });
    return;
  }

  console.error(`Comando desconocido: ${command}`);
  printUsage();
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exitCode = 1;
});
