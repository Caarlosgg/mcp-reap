import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOrphans, evaluateOrphan } from '../src/lib/orphan.js';

test('proceso con padre vivo y mas antiguo no es huerfano', () => {
  const parent = { pid: 100, ppid: 1, startedAtMs: 1000 };
  const child = { pid: 200, ppid: 100, startedAtMs: 2000 };
  const byPid = new Map([
    [parent.pid, parent],
    [child.pid, child],
  ]);

  const result = evaluateOrphan(child, byPid);
  assert.equal(result.isOrphan, false);
});

test('proceso cuyo ppid no existe en el snapshot es huerfano', () => {
  const child = { pid: 200, ppid: 9999, startedAtMs: 2000 };
  const byPid = new Map([[child.pid, child]]);

  const result = evaluateOrphan(child, byPid);
  assert.equal(result.isOrphan, true);
  assert.equal(result.reason, 'padre ausente');
});

test('proceso reparentado a init (ppid 1) es huerfano', () => {
  const child = { pid: 200, ppid: 1, startedAtMs: 2000 };
  const byPid = new Map([[child.pid, child]]);

  const result = evaluateOrphan(child, byPid);
  assert.equal(result.isOrphan, true);
  assert.equal(result.reason, 'reparentado a init/sistema');
});

test('pid del padre reciclado por un proceso mas nuevo cuenta como huerfano', () => {
  // El "padre" original murio; el SO reasigno su PID a otro proceso que
  // arranco DESPUES que el hijo. El hijo sigue huerfano aunque su ppid
  // numerico coincida con un proceso vivo.
  const impostor = { pid: 100, ppid: 1, startedAtMs: 5000 };
  const child = { pid: 200, ppid: 100, startedAtMs: 2000 };
  const byPid = new Map([
    [impostor.pid, impostor],
    [child.pid, child],
  ]);

  const result = evaluateOrphan(child, byPid);
  assert.equal(result.isOrphan, true);
  assert.equal(result.reason, 'pid del padre reciclado por otro proceso');
});

test('proceso reparentado al manager systemd --user se detecta como huerfano', () => {
  const manager = { pid: 500, ppid: 1, startedAtMs: 500, isSystemdUserManager: true };
  const child = { pid: 600, ppid: 500, startedAtMs: 3000 };
  const byPid = new Map([
    [manager.pid, manager],
    [child.pid, child],
  ]);

  const result = evaluateOrphan(child, byPid);
  assert.equal(result.isOrphan, true);
  assert.equal(result.reason, 'reparentado al manager systemd --user');
});

test('el manager systemd --user nunca se reporta a si mismo como huerfano', () => {
  // ppid: 1 (caso tipico: reparentado a init tras terminar la sesion) -
  // sin la exencion, la regla de "reparentado a init/sistema" lo marcaria.
  const manager = { pid: 500, ppid: 1, startedAtMs: 500, isSystemdUserManager: true };
  const byPid = new Map([[manager.pid, manager]]);

  const result = evaluateOrphan(manager, byPid);
  assert.equal(result.isOrphan, false);
  assert.equal(result.reason, null);
});

test('findOrphans: reporta al reparentado al manager pero nunca al manager mismo', () => {
  const records = [
    { pid: 500, ppid: 1, startedAtMs: 500, isSystemdUserManager: true },
    { pid: 600, ppid: 500, startedAtMs: 3000 },
  ];

  const orphans = findOrphans(records);
  const pids = orphans.map((o) => o.pid);
  assert.deepEqual(pids, [600]);
});

test('findOrphans devuelve solo los procesos huerfanos con su razon', () => {
  const records = [
    { pid: 100, ppid: 1, startedAtMs: 1000 },
    { pid: 200, ppid: 100, startedAtMs: 2000 },
    { pid: 300, ppid: 9999, startedAtMs: 3000 },
  ];

  const orphans = findOrphans(records);
  const pids = orphans.map((o) => o.pid).sort();
  assert.deepEqual(pids, [100, 300]);
});
