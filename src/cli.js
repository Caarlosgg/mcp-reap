#!/usr/bin/env node
import { scan, printReport } from './commands/scan.js';

function printUsage() {
  console.log('Uso: mzg scan [--json]');
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

  console.error(`Comando desconocido: ${command}`);
  printUsage();
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exitCode = 1;
});
