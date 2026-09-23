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
    warn(`[mzg] Could not read ${configPath}: ${err.message}. Continuing without a whitelist.`);
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    warn(
      `[mzg] Invalid config at ${configPath}: ${err.message}. ` +
        'Ignoring the whitelist (left empty) for safety; check the file.',
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
      `[mzg] The "whitelist" field in ${configPath} must be an array of strings. ` +
        'Ignoring it (left empty).',
    );
    return [];
  }

  // Cada patron se usa como regex (ver toRegExp/isWhitelisted). Un patron
  // que no compile (ej. "node(") haria throw mas tarde, dentro de clean,
  // justo en el momento de decidir a quien matar. Lo validamos aqui, al
  // cargar, y descartamos SOLO el patron roto (con aviso), conservando los
  // demas: un error tipografico en una linea no debe tumbar toda la
  // proteccion que el usuario configuro en las otras.
  const valid = [];
  for (const pattern of list) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern, 'i');
      valid.push(pattern);
    } catch (err) {
      warn(
        `[mzg] Whitelist pattern ignored for not being a valid regex: ` +
          `${JSON.stringify(pattern)} (${err.message}). The other patterns remain active.`,
      );
    }
  }
  return valid;
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
