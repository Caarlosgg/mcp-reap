// Snapshot de procesos simulado para `mzg scan --demo` y para el test de
// extremo a extremo. Tiene la misma forma que lo que devuelven los
// adaptadores reales (src/lib/processes/*.js), asi que pasa por el mismo
// camino de deteccion de huerfanos y atribucion de herramienta que un
// escaneo real: no hay una rama de codigo "modo demo" separada que se
// pueda desincronizar de la logica real.
//
// Incluye a proposito un caso "sano" (proceso de una herramienta conocida
// con padre vivo) para demostrar que el filtro no reporta todo lo que
// coincide por nombre, solo lo que ademas esta huerfano.
export function buildDemoSnapshot() {
  const now = Date.now();
  const minutesAgo = (m) => now - m * 60 * 1000;
  const hoursAgo = (h) => now - h * 60 * 60 * 1000;

  return [
    // --- Caso sano: MCP de Claude Code con su proceso padre vivo y mas
    // antiguo. No deberia aparecer en el reporte.
    { pid: 7000, ppid: 1, name: 'bash', cmd: 'bash', rssKB: 4000, startedAtMs: hoursAgo(5) },
    { pid: 6000, ppid: 7000, name: 'claude', cmd: 'claude', rssKB: 60000, startedAtMs: minutesAgo(15) },
    {
      pid: 5000,
      ppid: 6000,
      name: 'node',
      cmd: 'node /home/demo/.claude/mcp-servers/git/index.js',
      rssKB: 72000,
      startedAtMs: minutesAgo(10),
    },

    // --- Huerfano 1: MCP de Claude Code cuyo padre ya no existe.
    {
      pid: 8123,
      ppid: 8000, // 8000 no aparece en este snapshot: padre ausente
      name: 'node',
      cmd: 'node C:\\Users\\demo\\.claude\\mcp-servers\\filesystem\\index.js --root C:\\Users\\demo\\project',
      rssKB: 85000,
      startedAtMs: hoursAgo(3),
    },

    // --- Huerfano 2: servidor de Cursor cuyo pid de padre fue reciclado
    // por un proceso del sistema que arranco despues.
    {
      pid: 8500,
      ppid: 8300,
      name: 'node',
      cmd: 'C:\\Users\\demo\\.cursor-server\\bin\\abc123\\out\\server-main.js --port 9000',
      rssKB: 210000,
      startedAtMs: hoursAgo(26),
    },
    {
      pid: 8300,
      ppid: 1,
      name: 'svchost.exe',
      cmd: 'svchost.exe -k netsvcs',
      rssKB: 15000,
      startedAtMs: hoursAgo(1), // mas nuevo que el pid 8500 -> es un impostor
    },

    // --- Huerfano 3: Aider reparentado a init tras morir su padre.
    {
      pid: 9001,
      ppid: 1,
      name: 'python3',
      cmd: 'python3 -m aider.main --model gpt-4 --yes-always',
      rssKB: 145000,
      startedAtMs: minutesAgo(40),
    },
  ];
}
