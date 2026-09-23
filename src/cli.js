#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { scan, printReport } from './commands/scan.js';
import { clean, printCleanReport } from './commands/clean.js';

function printHelp() {
  console.log(
    [
      'mcp-reap — detects and cleans up orphaned processes from AI coding',
      'tools (Claude Code, Cursor, Codex, Aider, Gemini CLI): MCP servers,',
      'sub-agents, and browsers still alive with their parent process',
      'already dead.',
      '',
      'Usage:',
      '  mcp-reap <command> [options]        (short alias: mzg)',
      '',
      'Commands:',
      '  scan          Lists the orphaned processes detected (read-only).',
      '  clean         Kills the orphaned processes detected.',
      '                DRY-RUN BY DEFAULT: without --yes it only shows what',
      "                it would kill, it never touches any process.",
      '  init          Creates ~/.mzg/config.json with a whitelist template.',
      '',
      'scan options:',
      '  --json        JSON output instead of a table.',
      '',
      'clean options:',
      '  --yes         Actually kill processes. Without this flag, clean is dry-run.',
      '  --timeout=<s> Seconds to wait after SIGTERM before sending SIGKILL',
      '                (default 10).',
      '  --json        JSON output instead of a table.',
      '',
      'General options:',
      '  -h, --help    Show this help.',
      '  -v, --version Show the version.',
      '',
      'Security:',
      '  - clean NEVER kills without --yes (dry-run by default).',
      "  - Before killing, it revalidates that the PID is still the same process.",
      "  - SIGTERM first; SIGKILL only if it doesn't respond in time.",
      '  - Processes matching the whitelist (~/.mzg/config.json) are never',
      '    killed. Create the file with "mcp-reap init".',
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
      console.error('[DEMO] Simulated data, the real system was not scanned.\n');
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
      console.error('[DEMO] Simulated data; NO real process is touched.\n');
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

  console.error(`Unknown command: ${command}\n`);
  printHelp();
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exitCode = 1;
});
