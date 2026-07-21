#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { scan, printReport } from './commands/scan.js';
import { clean, printCleanReport } from './commands/clean.js';

function printHelp() {
  console.log(
    [
      'mcp-zombie-guard (mzg) — detecta y limpia procesos huerfanos de',
      'herramientas de codificacion con IA (Claude Code, Cursor, Codex,',
      'Aider, Gemini CLI): servidores MCP, sub-agentes y navegadores que',
      'siguen vivos con su proceso padre ya muerto.',
      '',
      'Uso:',
      '  mzg <comando> [opciones]',
      '',
      'Comandos:',
      '  scan          Lista los procesos huerfanos detectados (solo lectura).',
      '  clean         Mata los procesos huerfanos detectados.',
      '                DRY-RUN POR DEFECTO: sin --yes solo muestra que',
      '                mataria, no toca ningun proceso.',
      '  init          Crea ~/.mzg/config.json con una plantilla de lista blanca.',
      '',
      'Opciones de scan:',
      '  --json        Salida en JSON en vez de tabla.',
      '',
      'Opciones de clean:',
      '  --yes         Mata de verdad. Sin este flag, clean es dry-run.',
      '  --timeout=<s> Segundos a esperar tras SIGTERM antes de mandar SIGKILL',
      '                (por defecto 10).',
      '  --json        Salida en JSON en vez de tabla.',
      '',
      'Opciones generales:',
      '  -h, --help    Muestra esta ayuda.',
      '  -v, --version Muestra la version.',
      '',
      'Seguridad:',
      '  - clean NUNCA mata sin --yes (dry-run por defecto).',
      '  - Antes de matar revalida que el PID sigue siendo el mismo proceso.',
      '  - SIGTERM primero; SIGKILL solo si no responde a tiempo.',
      '  - Los procesos que coincidan con la lista blanca (~/.mzg/config.json)',
      '    nunca se matan. Crea el fichero con "mzg init".',
    ].join('\n'),
  );
}

function getVersion() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return pkg.version;
}

function flagValue(args, name) {
  const prefix = `${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

async function main(argv) {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === '--version' || command === '-v') {
    console.log(getVersion());
    return;
  }

  if (command === 'init') {
    const { init } = await import('./commands/init.js');
    init();
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

  console.error(`Comando desconocido: ${command}\n`);
  printHelp();
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exitCode = 1;
});
