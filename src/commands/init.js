import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaultConfigPath } from '../lib/whitelist.js';

// Plantilla en JSON VALIDO. JSON no admite comentarios de verdad, y meter
// `// ...` haria que loadWhitelist lo tratara como corrupto (aviso en cada
// ejecucion). Por eso la "documentacion" va en claves con guion bajo que
// loadWhitelist ignora: solo lee el campo "whitelist".
//
// Arranca vacia a proposito: init nunca protege nada de mas por ti, solo
// te deja el fichero listo para editar.
const TEMPLATE = {
  _ayuda:
    'Patterns (regex, case-insensitive) matched against "name + command line" of each process. Matches are NEVER killed by "mcp-reap clean".',
  _ejemplos: ['postgres', 'com\\.docker', 'my-critical-server'],
  whitelist: [],
};

/**
 * Crea ~/.mzg/config.json con la plantilla de lista blanca vacia. Nunca
 * sobrescribe uno existente.
 *
 * @param {{ configPath?: string, log?: (msg: string) => void }} [options]
 * @returns {{ created: boolean, configPath: string }}
 */
export function init({ configPath = defaultConfigPath(), log = console.log } = {}) {
  if (existsSync(configPath)) {
    log(
      [
        'A config already exists at:',
        `  ${configPath}`,
        '',
        'It was not touched (init never overwrites an existing one).',
        'Edit it by hand and add patterns to the "whitelist" array.',
      ].join('\n'),
    );
    return { created: false, configPath };
  }

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(TEMPLATE, null, 2)}\n`);

  log(
    [
      'Config created at:',
      `  ${configPath}`,
      '',
      'It contains an empty whitelist. To protect processes from "mcp-reap clean",',
      'add patterns to the "whitelist" array, for example:',
      '',
      '  "whitelist": ["postgres", "my-critical-server"]',
      '',
      'Each pattern is a case-insensitive regex matched against the name',
      'and command line of each process.',
    ].join('\n'),
  );
  return { created: true, configPath };
}
