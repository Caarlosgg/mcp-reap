import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { init } from '../src/commands/init.js';
import { loadWhitelist } from '../src/lib/whitelist.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mzg-init-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function captureLog() {
  const lines = [];
  return { log: (msg) => lines.push(msg), lines };
}

test('crea el config cuando no existe, con whitelist vacia', () => {
  withTempDir((dir) => {
    const configPath = join(dir, '.mzg', 'config.json');
    const { log, lines } = captureLog();

    const result = init({ configPath, log });

    assert.equal(result.created, true);
    assert.ok(existsSync(configPath));
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    assert.deepEqual(parsed.whitelist, []);
    assert.ok(lines.join('\n').includes(configPath));
  });
});

test('el config creado es JSON valido y loadWhitelist lo lee como lista vacia', () => {
  withTempDir((dir) => {
    const configPath = join(dir, '.mzg', 'config.json');
    init({ configPath, log: () => {} });

    // No debe avisar de nada: es un config valido con whitelist vacia.
    const warnings = [];
    const patterns = loadWhitelist(configPath, { warn: (m) => warnings.push(m) });
    assert.deepEqual(patterns, []);
    assert.equal(warnings.length, 0);
  });
});

test('nunca sobrescribe un config existente', () => {
  withTempDir((dir) => {
    const configPath = join(dir, '.mzg', 'config.json');
    // Config del usuario con patrones que NO se deben perder.
    init({ configPath, log: () => {} });
    writeFileSync(configPath, JSON.stringify({ whitelist: ['postgres'] }, null, 2));

    const { log, lines } = captureLog();
    const result = init({ configPath, log });

    assert.equal(result.created, false);
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    assert.deepEqual(parsed.whitelist, ['postgres'], 'no debe tocar el contenido existente');
    assert.match(lines.join('\n'), /existe|no se ha tocado/i);
  });
});
