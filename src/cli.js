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
    const results = await scan();
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
