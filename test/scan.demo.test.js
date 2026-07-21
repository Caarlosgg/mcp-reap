import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from '../src/commands/scan.js';
import { buildDemoSnapshot } from '../src/lib/demoData.js';

// Corre el pipeline real de scan() (deteccion de huerfanos + atribucion de
// herramienta) contra el snapshot simulado, en vez de contra el SO. Sirve
// de test de extremo a extremo y como lo que respalda `mzg scan --demo`.
test('scan detecta los huerfanos simulados y excluye el proceso sano', async () => {
  const results = await scan({ processSource: () => buildDemoSnapshot() });

  const pids = results.map((r) => r.pid).sort((a, b) => a - b);
  assert.deepEqual(pids, [8123, 8500, 9001]);

  // El MCP de Claude Code con padre vivo (pid 5000) no debe aparecer.
  assert.ok(!pids.includes(5000));
});

test('scan atribuye cada huerfano simulado a la herramienta y razon correctas', async () => {
  const results = await scan({ processSource: () => buildDemoSnapshot() });
  const byPid = new Map(results.map((r) => [r.pid, r]));

  assert.equal(byPid.get(8123).tool, 'claude-code');
  assert.equal(byPid.get(8123).orphanReason, 'padre ausente');

  assert.equal(byPid.get(8500).tool, 'cursor');
  assert.equal(byPid.get(8500).orphanReason, 'pid del padre reciclado por otro proceso');

  assert.equal(byPid.get(9001).tool, 'aider');
  assert.equal(byPid.get(9001).orphanReason, 'reparentado a init/sistema');
});
