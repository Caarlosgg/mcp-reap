import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean } from '../src/commands/clean.js';
import { createMemoryLogger } from '../src/lib/logger.js';
import { buildDemoSnapshot } from '../src/lib/demoData.js';

// PIDs huerfanos que el snapshot de demo produce (ver demoData.js).
const ORPHAN_PIDS = [8123, 8500, 9001];

// buildDemoSnapshot() calcula startedAtMs relativo a Date.now(), asi que
// cada llamada da timestamps ligeramente distintos. En el SO real
// startedAtMs es absoluto y ESTABLE entre escaneos, que es justo lo que
// hace fiable la revalidacion. Reproducimos esa estabilidad capturando UNA
// base y reusandola (clean solo lee el snapshot, nunca lo muta), y
// derivando de ella las variantes (reciclado / muerto) que algun test
// necesite.
const BASE = buildDemoSnapshot();

// Control simulado con reloj virtual. `kill` registra cada llamada y va
// eliminando PIDs del conjunto vivo; los `stubborn` ignoran SIGTERM y solo
// mueren con SIGKILL. Nunca toca procesos reales.
function makeControl(pids, { stubborn = [] } = {}) {
  const alive = new Set(pids);
  const stubbornSet = new Set(stubborn);
  const calls = [];
  let clock = 0;

  return {
    calls,
    alive,
    kill(pid, signal) {
      calls.push([pid, signal]);
      if (!alive.has(pid)) {
        const err = new Error('no such process');
        err.code = 'ESRCH';
        throw err;
      }
      if (signal === 'SIGKILL' || !stubbornSet.has(pid)) {
        alive.delete(pid);
      }
    },
    isAlive(pid) {
      return alive.has(pid);
    },
    async sleep(ms) {
      clock += ms;
    },
    now() {
      return clock;
    },
  };
}

test('dry-run por defecto no mata nada', async () => {
  const control = makeControl(ORPHAN_PIDS);
  const outcome = await clean({
    processSource: () => BASE,
    control,
    logger: createMemoryLogger(),
    // yes: false (por defecto)
  });

  assert.equal(outcome.dryRun, true);
  assert.equal(outcome.killTargets.length, 3);
  assert.equal(control.calls.length, 0, 'no debe enviarse ninguna senal en dry-run');
});

test('--yes mata con SIGTERM los procesos que responden', async () => {
  const control = makeControl(ORPHAN_PIDS); // ninguno stubborn
  const outcome = await clean({
    processSource: () => BASE,
    control,
    logger: createMemoryLogger(),
    yes: true,
  });

  assert.equal(outcome.dryRun, false);
  assert.equal(outcome.results.length, 3);
  assert.ok(outcome.results.every((r) => r.status === 'muerto'));
  assert.ok(outcome.results.every((r) => r.finalSignal === 'SIGTERM'));
  // Nadie recibio SIGKILL.
  assert.ok(!control.calls.some(([, sig]) => sig === 'SIGKILL'));
});

test('escala a SIGKILL cuando el proceso ignora SIGTERM', async () => {
  const control = makeControl(ORPHAN_PIDS, { stubborn: [8500] });
  const outcome = await clean({
    processSource: () => BASE,
    control,
    logger: createMemoryLogger(),
    yes: true,
    timeoutMs: 2000,
  });

  const cursor = outcome.results.find((r) => r.target.pid === 8500);
  assert.equal(cursor.status, 'muerto');
  assert.equal(cursor.finalSignal, 'SIGKILL');
  assert.ok(control.calls.some(([pid, sig]) => pid === 8500 && sig === 'SIGTERM'));
  assert.ok(control.calls.some(([pid, sig]) => pid === 8500 && sig === 'SIGKILL'));
});

test('la lista blanca protege procesos aunque sean huerfanos', async () => {
  const control = makeControl(ORPHAN_PIDS);
  const outcome = await clean({
    processSource: () => BASE,
    control,
    logger: createMemoryLogger(),
    whitelist: [/aider/i],
    yes: true,
  });

  // Aider (pid 9001) queda protegido: ni objetivo ni senal.
  assert.ok(outcome.whitelisted.some((t) => t.pid === 9001));
  assert.ok(!outcome.results.some((r) => r.target.pid === 9001));
  assert.ok(!control.calls.some(([pid]) => pid === 9001));
});

test('revalidacion: NO mata un PID reciclado por otro proceso', async () => {
  // La primera llamada a processSource (deteccion) ve el huerfano original;
  // las siguientes (revalidacion) ven el mismo PID pero con otro
  // startedAtMs, como si el SO lo hubiera reasignado a un proceso nuevo.
  let calls = 0;
  // Derivamos de la MISMA base: los PIDs no tocados conservan su
  // startedAtMs, solo 8123 cambia (como si el SO lo hubiera reasignado).
  const recycled = BASE.map((p) =>
    p.pid === 8123 ? { ...p, startedAtMs: p.startedAtMs + 999_999 } : p,
  );
  const processSource = () => {
    calls += 1;
    return calls === 1 ? BASE : recycled;
  };

  const control = makeControl(ORPHAN_PIDS);
  const outcome = await clean({
    processSource,
    control,
    logger: createMemoryLogger(),
    yes: true,
  });

  const claude = outcome.results.find((r) => r.target.pid === 8123);
  assert.equal(claude.status, 'omitido');
  assert.match(claude.reason, /reciclado/);
  // Nunca se le envio una senal al PID reciclado.
  assert.ok(!control.calls.some(([pid]) => pid === 8123));
});

test('revalidacion: omite un proceso que murio solo entre escaneo y kill', async () => {
  let calls = 0;
  const withoutClaude = BASE.filter((p) => p.pid !== 8123);
  const processSource = () => {
    calls += 1;
    return calls === 1 ? BASE : withoutClaude;
  };

  const control = makeControl(ORPHAN_PIDS);
  const outcome = await clean({
    processSource,
    control,
    logger: createMemoryLogger(),
    yes: true,
  });

  const claude = outcome.results.find((r) => r.target.pid === 8123);
  assert.equal(claude.status, 'omitido');
  assert.match(claude.reason, /ya no existe/);
  assert.ok(!control.calls.some(([pid]) => pid === 8123));
});

test('registra cada accion en el logger', async () => {
  const logger = createMemoryLogger();
  const control = makeControl(ORPHAN_PIDS);
  await clean({
    processSource: () => BASE,
    control,
    logger,
    yes: true,
  });

  const events = logger.entries.map((e) => e.event);
  assert.ok(events.includes('objetivo'));
  assert.ok(events.includes('senal'));
  assert.ok(events.includes('resultado'));
  // Cada entrada lleva timestamp.
  assert.ok(logger.entries.every((e) => typeof e.ts === 'string'));
});
