import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadWhitelist, isWhitelisted } from '../src/lib/whitelist.js';

// Crea un fichero de config temporal y devuelve su ruta. Los tests que no
// escriben fichero apuntan a una ruta inexistente dentro del temp dir.
function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mzg-cfg-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Captura los avisos en vez de imprimirlos, para poder aseverar sobre ellos.
function captureWarns() {
  const warnings = [];
  return { warn: (msg) => warnings.push(msg), warnings };
}

test('fichero ausente: lista vacia, sin aviso', () => {
  withTempDir((dir) => {
    const { warn, warnings } = captureWarns();
    const result = loadWhitelist(join(dir, 'no-existe.json'), { warn });
    assert.deepEqual(result, []);
    assert.equal(warnings.length, 0, 'un config ausente es normal, no debe avisar');
  });
});

test('fichero valido: devuelve los patrones del campo whitelist', () => {
  withTempDir((dir) => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ whitelist: ['aider', 'mi-daemon'] }));

    const { warn, warnings } = captureWarns();
    const result = loadWhitelist(path, { warn });
    assert.deepEqual(result, ['aider', 'mi-daemon']);
    assert.equal(warnings.length, 0);
  });
});

test('los patrones cargados funcionan con isWhitelisted', () => {
  withTempDir((dir) => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ whitelist: ['aider'] }));

    const patterns = loadWhitelist(path, { warn: () => {} });
    assert.equal(isWhitelisted({ name: 'python3', cmd: 'python3 -m aider.main' }, patterns), true);
    assert.equal(isWhitelisted({ name: 'node', cmd: 'node server.js' }, patterns), false);
  });
});

test('fichero corrupto (JSON invalido): lista vacia y aviso por seguridad', () => {
  withTempDir((dir) => {
    const path = join(dir, 'config.json');
    writeFileSync(path, '{ "whitelist": ["aider",  <-- roto');

    const { warn, warnings } = captureWarns();
    const result = loadWhitelist(path, { warn });
    assert.deepEqual(result, [], 'ante config corrupto NO se aplica ninguna proteccion adivinada');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /corrupto|invalid/i);
  });
});

test('config valido sin campo whitelist: lista vacia, sin aviso', () => {
  withTempDir((dir) => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ otraCosa: true }));

    const { warn, warnings } = captureWarns();
    const result = loadWhitelist(path, { warn });
    assert.deepEqual(result, []);
    assert.equal(warnings.length, 0);
  });
});

test('campo whitelist mal formado (no es array de strings): lista vacia y aviso', () => {
  withTempDir((dir) => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ whitelist: [123, 'aider'] }));

    const { warn, warnings } = captureWarns();
    const result = loadWhitelist(path, { warn });
    assert.deepEqual(result, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /array of strings/i);
  });
});

test('patron invalido entre validos: sobreviven los validos, se descarta el roto', () => {
  withTempDir((dir) => {
    const path = join(dir, 'config.json');
    // "node(" es una regex invalida (parentesis sin cerrar).
    writeFileSync(path, JSON.stringify({ whitelist: ['aider', 'node(', 'cursor'] }));

    const { warn, warnings } = captureWarns();
    const result = loadWhitelist(path, { warn });

    assert.deepEqual(result, ['aider', 'cursor'], 'un patron roto no debe tumbar a los demas');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /"node\("/);
    assert.match(warnings[0], /valid regex/i);
  });
});

test('todos los patrones invalidos: lista vacia y un aviso por cada uno', () => {
  withTempDir((dir) => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ whitelist: ['node(', '[unclosed', '*bad'] }));

    const { warn, warnings } = captureWarns();
    const result = loadWhitelist(path, { warn });

    assert.deepEqual(result, []);
    assert.equal(warnings.length, 3, 'un aviso por cada patron descartado');
    assert.ok(warnings.every((w) => /valid regex/i.test(w)));
  });
});

test('un patron valido sobrevive y sigue funcionando con isWhitelisted', () => {
  withTempDir((dir) => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ whitelist: ['node(', 'aider'] }));

    const patterns = loadWhitelist(path, { warn: () => {} });
    assert.deepEqual(patterns, ['aider']);
    assert.equal(isWhitelisted({ name: 'python3', cmd: 'python3 -m aider.main' }, patterns), true);
  });
});
