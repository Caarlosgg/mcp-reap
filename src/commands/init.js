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
    'Patrones (regex, sin distinguir mayus/minus) comparados contra "nombre + linea de comandos" de cada proceso. Los que coincidan NUNCA se mataran con "mzg clean".',
  _ejemplos: ['postgres', 'com\\.docker', 'mi-servidor-critico'],
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
        'Ya existe un config en:',
        `  ${configPath}`,
        '',
        'No se ha tocado (init nunca sobrescribe uno existente).',
        'Editalo a mano y anade patrones al array "whitelist".',
      ].join('\n'),
    );
    return { created: false, configPath };
  }

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(TEMPLATE, null, 2)}\n`);

  log(
    [
      'Config creado en:',
      `  ${configPath}`,
      '',
      'Contiene una lista blanca vacia. Para proteger procesos de "mzg clean",',
      'anade patrones al array "whitelist", por ejemplo:',
      '',
      '  "whitelist": ["postgres", "mi-servidor-critico"]',
      '',
      'Cada patron es una regex (sin distinguir mayus/minus) que se compara',
      'contra el nombre y la linea de comandos de cada proceso.',
    ].join('\n'),
  );
  return { created: true, configPath };
}
