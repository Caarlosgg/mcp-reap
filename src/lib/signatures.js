// Cuando un proceso queda huerfano, su padre ya murio: no podemos recorrer
// el arbol de procesos hacia arriba para preguntar "quien te lanzo". Lo
// unico que nos queda es el propio nombre/linea de comandos del huerfano,
// asi que la atribucion a una herramienta es heuristica (regex sobre
// nombre + cmdline), no una relacion de parentesco verificada.
export const TOOL_SIGNATURES = [
  {
    tool: 'claude-code',
    label: 'Claude Code',
    patterns: [
      /claude-code/i,
      /@anthropic-ai[\\/]claude-code/i,
      /[\\/]\.claude[\\/]/i,
    ],
  },
  {
    tool: 'cursor',
    label: 'Cursor',
    patterns: [
      /cursor[ -]?server/i,
      /\.cursor-server/i,
      /cursor helper/i,
      /[\\/]\.cursor[\\/]/i,
      /cursor-nightly/i,
    ],
  },
  {
    tool: 'codex',
    label: 'Codex CLI',
    patterns: [/@openai[\\/]codex/i, /codex-cli/i, /\bcodex\b/i],
  },
  {
    tool: 'aider',
    label: 'Aider',
    patterns: [/\baider\.main\b/i, /\baider\b/i],
  },
  {
    tool: 'gemini-cli',
    label: 'Gemini CLI',
    patterns: [/@google[\\/]gemini-cli/i, /gemini-cli/i],
  },
  {
    // Cubre servidores MCP lanzados por herramientas que no reconocemos
    // todavia por nombre, para no perderlos del reporte.
    tool: 'mcp-generic',
    label: 'Servidor MCP (herramienta no identificada)',
    patterns: [/mcp-server/i, /modelcontextprotocol/i, /\bmcp\b.*server/i],
  },
];

/**
 * @param {{ name: string, cmd: string }} record
 * @returns {{ tool: string, label: string } | null}
 */
export function identifyTool(record) {
  const haystack = `${record.name} ${record.cmd}`;
  for (const signature of TOOL_SIGNATURES) {
    if (signature.patterns.some((pattern) => pattern.test(haystack))) {
      return { tool: signature.tool, label: signature.label };
    }
  }
  return null;
}
