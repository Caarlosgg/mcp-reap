import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatDuration, truncate } from '../src/lib/format.js';

test('formatBytes elige la unidad apropiada', () => {
  assert.equal(formatBytes(512), '512.0B');
  assert.equal(formatBytes(2048), '2.0KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0MB');
});

test('formatDuration escala de segundos a dias', () => {
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(125), '2m 5s');
  assert.equal(formatDuration(3 * 3600 + 60), '3h 1m');
  assert.equal(formatDuration(2 * 86400 + 3600), '2d 1h');
});

test('truncate corta texto largo y lo deja intacto si ya cabe', () => {
  assert.equal(truncate('hola', 10), 'hola');
  assert.equal(truncate('a'.repeat(20), 5), 'aaaa…');
});
