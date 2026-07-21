# mcp-zombie-guard

## Qué es
CLI en Node.js que detecta y limpia procesos huérfanos dejados por
herramientas de codificación con IA (Claude Code, Cursor, Codex, Aider,
Gemini CLI). Referencia de diseño: zclean (github.com/TheStack-ai/zclean),
pero diferenciado por soporte multi-máquina/equipo, que zclean no cubre.

## Reglas no negociables
- Dry-run por defecto siempre. Nunca matar un proceso sin --yes explícito.
- Verificar que el proceso padre esté realmente muerto antes de tocar nada.
- SIGTERM primero, esperar, SIGKILL solo si no responde.
- Todo lo que borre/mate algo necesita lista blanca configurable.
- Cero dependencias externas si es posible (usar solo Node.js nativo).

## Cómo trabajamos
- Cada sesión termina en un commit que compila y pasa los tests.
- Explica el porqué de cada decisión de arquitectura no obvia, no solo el qué.
- Si falta contexto o un archivo, pregúntame — no asumas la estructura.
- Verificación real: build + test + que yo lo pruebe a mano, no solo "pasa".

## Estado actual
Hecho:
- CLI base (`src/cli.js`) con comando `scan` (`--json` opcional).
- Listado de procesos multiplataforma sin dependencias npm: `/proc` en
  Linux, `ps` en macOS, `Get-CimInstance Win32_Process` vía PowerShell en
  Windows (`src/lib/processes/*`).
- Detección de huérfanos (`src/lib/orphan.js`): padre ausente, ppid<=1
  (reparentado a init), o PID de padre reciclado por un proceso más nuevo
  (comparando timestamps de arranque).
- Identificación de herramienta por firmas regex sobre nombre+cmdline
  (`src/lib/signatures.js`): Claude Code, Cursor, Codex, Aider, Gemini
  CLI, más un fallback genérico "servidor MCP no identificado".
- 13 tests unitarios sobre la lógica pura (orphan, signatures, format);
  no testean los adaptadores de SO reales.
- `npm run build` = chequeo sintáctico (`node --check`) de todo `src/`,
  ya que no hay paso de compilación real (JS nativo, cero deps).
- `scan` acepta una fuente de procesos inyectable (`src/commands/scan.js`,
  parámetro `processSource`), por defecto el listado real del SO. Permite
  correr la misma lógica de detección/atribución sobre un snapshot
  simulado (`src/lib/demoData.js`) sin duplicar código: usado por
  `mzg scan --demo` (flag oculto, no sale en `--help`) y por
  `test/scan.demo.test.js`.

Limitación conocida (documentar antes de tocarla): la columna "tiempo
activo" es el tiempo que el proceso lleva corriendo, NO el tiempo que
lleva huérfano — no persistimos histórico entre escaneos, así que no
sabemos cuándo murió el padre, solo que ya está muerto ahora. Si se
necesita un dato de "huérfano desde hace X" preciso, hace falta guardar
estado entre ejecuciones (ej. `~/.mzg/state.json` con primer-visto por
PID).

Falta:
- Comando de limpieza (`clean`/`kill`) con dry-run, SIGTERM→SIGKILL,
  lista blanca configurable — nada de esto existe todavía, solo se
  escanea.
- Soporte multi-máquina/equipo (el diferenciador vs. zclean) — sin
  diseñar aún.
- Lista blanca configurable (regla no negociable) — no implementada
  porque no hay nada que mate procesos todavía.