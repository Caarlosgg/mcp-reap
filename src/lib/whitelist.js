// Lista blanca: patrones (regex sobre "name cmd") de procesos que NUNCA se
// matan, aunque scan los detecte como huerfanos. Es una regla no
// negociable del proyecto: el usuario debe poder blindar procesos que
// sabe que son legitimos aunque coincidan con una firma de herramienta.
//
// Por ahora vive como array en codigo (vacio por defecto). El fichero de
// configuracion (~/.mzg/config) que lo alimente vendra en una iteracion
// posterior; se dejo la funcion `isWhitelisted` con `patterns` inyectable
// justo para que ese cambio no toque a quien la usa.
export const DEFAULT_WHITELIST = [
  // Ejemplos (descomenta para proteger):
  // /my-critical-daemon/i,
  // 'com.apple.',
];

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
