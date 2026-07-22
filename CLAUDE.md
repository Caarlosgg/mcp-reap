# mcp-reap

## Qué es
CLI en Node.js que detecta y limpia procesos huérfanos dejados por
herramientas de codificación con IA (Claude Code, Cursor, Codex, Aider,
Gemini CLI). Referencia de diseño: zclean (github.com/TheStack-ai/zclean),
pero diferenciado por soporte multi-máquina/equipo, que zclean no cubre.
Se publica como paquete `mcp-reap`; el binario principal es `mcp-reap`,
con `mzg` como alias corto. El namespace de config/estado sigue siendo
`~/.mzg/` (ligado al alias corto).

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
- Comando `clean` (`src/commands/clean.js`): reusa la detección de `scan`
  y mata los huérfanos. Dry-run por defecto (`mzg clean` solo muestra);
  solo `mzg clean --yes` mata. `--timeout=<seg>` configura la espera
  (default 10s). Piezas con efecto todas inyectables (`processSource`,
  `control`, `logger`) para testear sin matar nada real.
  - `src/lib/reaper.js`: revalidación pre-kill (PID vivo + startedAtMs
    idéntico, para no matar un PID reciclado) y escalada
    SIGTERM→espera→SIGKILL. `control` abstrae el contacto con el SO.
  - `src/lib/whitelist.js`: lista blanca (regla no negociable). Los
    patrones se cargan de `~/.mzg/config.json` (campo `whitelist`: array
    de strings) vía `loadWhitelist()`. Ante cualquier problema (fichero
    ausente, ilegible, JSON corrupto, campo mal formado) devuelve lista
    vacía; el fichero ausente es silencioso (caso normal), el resto avisa
    por stderr. `isWhitelisted` y la inyección de patrones intactos. El
    CLI carga el config solo en el camino real; en `--demo` la whitelist
    va vacía a propósito (determinismo e independencia del config real).
    Cada patrón se valida como regex al cargar: uno que no compile (ej.
    `"node("`) se descarta con aviso por stderr y los demás siguen
    activos — un patrón roto no tumba toda la whitelist.
  - `src/lib/logger.js`: log de auditoría JSONL en `~/.mzg/clean.log`
    (solo se crea al matar de verdad, no en dry-run). Logger en memoria
    para tests y `--demo`.
  - `src/lib/demoWorld.js`: mundo simulado para `mzg clean --demo` con
    `control` que NUNCA llama a `process.kill` real (los PID del snapshot
    podrían coincidir con procesos reales). PID 8500 ignora SIGTERM para
    demostrar la escalada a SIGKILL.
  - `src/lib/format.js` ganó `renderTable` (usado por `clean`, no toca
    `scan.js`).
  - 9 tests nuevos en `test/clean.test.js`: dry-run no mata, `--yes`
    mata, escalada a SIGKILL, whitelist protege, revalidación omite PID
    reciclado y proceso ya muerto, logging.
- CLI (`src/cli.js`): `mzg --help` (y `mzg` sin args) muestra ayuda
  completa (comandos, flags, bloque de seguridad; `--demo` sigue oculto).
  `mzg --version`/`-v` lee la versión de `package.json` vía
  `import.meta.url`. `mzg init` (`src/commands/init.js`) crea
  `~/.mzg/config.json` con plantilla de whitelist vacía; nunca sobrescribe
  uno existente. La plantilla documenta con claves `_ayuda`/`_ejemplos`
  (JSON no admite comentarios; `loadWhitelist` ignora esas claves).
  `configPath`/`log` inyectables para testear sin tocar `~/.mzg` real.
  3 tests en `test/init.test.js`.

Terminación por plataforma (`src/lib/reaper.js`, control real):
- Unix (mac/Linux): `process.kill` con SIGTERM→espera→SIGKILL reales.
- Windows: `process.kill(pid,'SIGTERM')` NO es suave ahí (Node llama a
  TerminateProcess, kill forzado igual que SIGKILL), así que la escalada
  no existiría. Usamos `taskkill` (nativo, cero deps): `'SIGTERM'` →
  `taskkill /PID <pid>` (cierre ordenado), espera el timeout, y `'SIGKILL'`
  → `taskkill /PID <pid> /F` (forzado). La interfaz `control.kill(pid,
  signal)` es idéntica en ambos SO, así que `reap`/`clean` no saben en qué
  plataforma corren. `makeWindowsKill({run, isAlive})` tiene el `run` de
  taskkill inyectable para testear sin ejecutarlo. Verificado a mano en
  Windows real matando un `node` propio: el cierre suave no se entrega a
  un proceso de consola sin ventana → escala a `/F` y lo mata.
  Límite: si un proceso ignora el cierre ordenado (no procesa WM_CLOSE),
  el paso suave no hace nada y siempre acabamos en `/F` — es correcto,
  pero pierde la ventaja de dejar limpiar recursos (ver explicación al
  usuario). Tests en `test/reaper.windows.test.js` (8, con taskkill
  simulado).

Limitación conocida (documentar antes de tocarla): la columna "tiempo
activo" es el tiempo que el proceso lleva corriendo, NO el tiempo que
lleva huérfano — no persistimos histórico entre escaneos, así que no
sabemos cuándo murió el padre, solo que ya está muerto ahora. Si se
necesita un dato de "huérfano desde hace X" preciso, hace falta guardar
estado entre ejecuciones (ej. `~/.mzg/state.json` con primer-visto por
PID).

Falta:
- No hay flag CLI ni comando para editar/inspeccionar la whitelist; se
  edita `~/.mzg/config.json` a mano.
- Soporte multi-máquina/equipo (el diferenciador vs. zclean) — sin
  diseñar aún.
- Revalidación por-PID más barata: hoy `clean` re-pide el snapshot
  completo del SO una vez por objetivo. Con pocos huérfanos es
  irrelevante, pero una consulta a un solo PID sería más eficiente.