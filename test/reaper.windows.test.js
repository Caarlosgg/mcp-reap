import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindowsKill, reap } from '../src/lib/reaper.js';

// Estos tests ejercitan el camino Windows (taskkill suave -> /F) SIN
// ejecutar taskkill real: inyectamos un `run` simulado y una tabla de
// procesos en memoria.

// Simula el exit != 0 de taskkill (execFileSync lanza en ese caso).
function taskkillError(msg) {
  const err = new Error(msg);
  err.status = 1;
  return err;
}

// --- makeWindowsKill: las tres ramas de traduccion/errores ---

test('makeWindowsKill: SIGKILL usa /F (force=true)', () => {
  const calls = [];
  const kill = makeWindowsKill({
    run: (pid, force) => calls.push({ pid, force }),
    isAlive: () => true,
  });
  kill(1234, 'SIGKILL');
  assert.deepEqual(calls, [{ pid: 1234, force: true }]);
});

test('makeWindowsKill: SIGTERM usa cierre suave (force=false)', () => {
  const calls = [];
  const kill = makeWindowsKill({
    run: (pid, force) => calls.push({ pid, force }),
    isAlive: () => true,
  });
  kill(1234, 'SIGTERM');
  assert.deepEqual(calls, [{ pid: 1234, force: false }]);
});

test('makeWindowsKill: cierre suave no entregable con proceso vivo NO es fatal', () => {
  // taskkill sin /F falla ("can only be terminated forcefully") pero el
  // proceso sigue vivo: no debe lanzar, para que reap escale a /F.
  const kill = makeWindowsKill({
    run: () => {
      throw taskkillError('This process can only be terminated forcefully.');
    },
    isAlive: () => true,
  });
  assert.doesNotThrow(() => kill(1234, 'SIGTERM'));
});

test('makeWindowsKill: taskkill falla y el proceso ya no existe -> ESRCH', () => {
  const kill = makeWindowsKill({
    run: () => {
      throw taskkillError('ERROR: The process "1234" not found.');
    },
    isAlive: () => false,
  });
  assert.throws(() => kill(1234, 'SIGTERM'), (err) => err.code === 'ESRCH');
});

test('makeWindowsKill: fallo del intento FORZADO con proceso vivo si es fatal', () => {
  // Con /F y aun asi falla (p.ej. acceso denegado) estando vivo: error real.
  const kill = makeWindowsKill({
    run: () => {
      throw taskkillError('ERROR: Access is denied.');
    },
    isAlive: () => true,
  });
  assert.throws(() => kill(1234, 'SIGKILL'), /denied/i);
});

// --- Integracion a traves de reap: el mundo Windows simulado ---

// run/isAlive comparten una tabla de PIDs. Los `stubborn` solo mueren con
// /F (cierre suave no entregable), como un proceso de consola sin ventana.
function windowsWorld({ pids, stubborn = [] }) {
  const alive = new Set(pids);
  const stubbornSet = new Set(stubborn);
  const run = (pid, force) => {
    if (!alive.has(pid)) throw taskkillError('not found');
    if (force) {
      alive.delete(pid); // /F siempre mata
      return;
    }
    if (stubbornSet.has(pid)) {
      throw taskkillError('can only be terminated forcefully'); // sigue vivo
    }
    alive.delete(pid); // cierre suave aceptado
  };
  const aliveCheck = (pid) => alive.has(pid);

  let clock = 0;
  const control = {
    kill: makeWindowsKill({ run, isAlive: aliveCheck }),
    isAlive: aliveCheck,
    async sleep(ms) {
      clock += ms;
    },
    now() {
      return clock;
    },
  };
  return { control, alive };
}

test('reap en Windows: proceso que acepta el cierre suave muere con SIGTERM', async () => {
  const { control } = windowsWorld({ pids: [1000] });
  const result = await reap({ pid: 1000 }, { control, timeoutMs: 5000 });
  assert.equal(result.killed, true);
  assert.equal(result.finalSignal, 'SIGTERM');
});

test('reap en Windows: proceso que ignora el cierre suave escala a /F (SIGKILL)', async () => {
  const { control } = windowsWorld({ pids: [2000], stubborn: [2000] });
  const result = await reap({ pid: 2000 }, { control, timeoutMs: 5000 });
  assert.equal(result.killed, true);
  assert.equal(result.finalSignal, 'SIGKILL');
});

test('reap en Windows: proceso ya muerto se cuenta como killed sin fallo', async () => {
  const { control } = windowsWorld({ pids: [] }); // 3000 no existe
  const result = await reap({ pid: 3000 }, { control, timeoutMs: 5000 });
  assert.equal(result.killed, true);
});
