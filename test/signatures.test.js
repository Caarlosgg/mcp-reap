import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyTool } from '../src/lib/signatures.js';

test('identifica un servidor MCP lanzado por Claude Code por su ruta', () => {
  const record = {
    name: 'node',
    cmd: '/usr/local/bin/node /Users/x/.claude/mcp-servers/filesystem/index.js',
  };
  assert.equal(identifyTool(record)?.tool, 'claude-code');
});

test('identifica un proceso de Cursor por su carpeta de servidor', () => {
  const record = {
    name: 'node',
    cmd: '/home/user/.cursor-server/bin/abc123/node server-main.js',
  };
  assert.equal(identifyTool(record)?.tool, 'cursor');
});

test('identifica Aider por el modulo python', () => {
  const record = { name: 'python3', cmd: 'python3 -m aider.main --model gpt-4' };
  assert.equal(identifyTool(record)?.tool, 'aider');
});

test('identifica un servidor MCP generico cuando no matchea ninguna herramienta conocida', () => {
  const record = {
    name: 'npx',
    cmd: 'npx -y @some/unknown-mcp-server --port 4000',
  };
  assert.equal(identifyTool(record)?.tool, 'mcp-generic');
});

test('devuelve null para procesos sin relacion con herramientas de IA', () => {
  const record = { name: 'chrome', cmd: '/usr/bin/chrome --profile-directory=Default' };
  assert.equal(identifyTool(record), null);
});
