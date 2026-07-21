// Lista blanca: patrones (regex sobre "name cmd") de procesos que NUNCA se
// matan, aunque scan los detecte como huerfanos. Es una regla no
// negociable del proyecto: el usuario debe poder blindar procesos que
// sabe que son legitimos aunque coincidan con una firma de herramienta.
//
// Los patrones se cargan de ~/.mzg/config.json (ver loadWhitelist). El
// array en codigo (DEFAULT_WHITELIST) queda como fallback vacio para que
// isWhitelisted funcione sin config y para no romper a quien la llame sin
// pasar patrones.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULT_WHITELIST = [];

export function defaultConfigPath() {
  return join(homedir(), '.mzg', 'config.json');
}

/**
 * Carga los patrones de whitelist desde el fichero de config.
 *
 * Filosofia de seguridad: ante CUALQUIER problema (fichero ausente, ilegible,
 * JSON corrupto, campo mal formado) devolvemos lista vacia. Nunca lanzamos
 * ni adivinamos. Un fichero ausente es silencioso (caso normal); todo lo
 * demas avisa por stderr para que el usuario sepa que su whitelist no se
 * esta aplicando.
 *
 * @param {string} [configPath]
 * @param {{ warn?: (msg: string) => void }} [opts] `warn` inyectable para tests.
 * @returns {string[]} patrones (strings) o [] si no hay/es invalido.
 */
export function loadWhitelist(
  configPath = defaultConfigPath(),
  { warn = (msg) => console.error(msg) } = {},
) {
  let raw;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      // No hay config: caso normal, no es un error. Lista vacia en silencio.
      return [];
    }
    warn(`[mzg] No se pudo leer ${configPath}: ${err.message}. Se continua sin lista blanca.`);
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    warn(
      `[mzg] Config corrupto en ${configPath}: ${err.message}. ` +
        'Se ignora la lista blanca (queda vacia) por seguridad; revisa el fichero.',
    );
    return [];
  }

  const list = parsed?.whitelist;
  if (list === undefined) {
    // Config valido pero sin campo whitelist: legitimo, lista vacia.
    return [];
  }
  if (!Array.isArray(list) || !list.every((p) => typeof p === 'string')) {
    warn(
      `[mzg] El campo "whitelist" de ${configPath} debe ser un array de strings. ` +
        'Se ignora (queda vacia).',
    );
    return [];
  }
  return list;
}

function toRegExp(pattern) {
  return pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
}

/**
 * @param {{ name?: string, cmd?: string }} record
 * @param {Array<string | RegExp>} [patterns]
 */
export function isWhitelisted(record, patterns = DEFAULT_WHITELIST) {
  const haystack = `${record.name ?? ''} ${record.cmd ?? ''}`;
  return patterns.some((pattern) => toRegExp(pattern).test(haystack));
}
