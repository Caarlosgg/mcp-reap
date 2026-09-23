# mcp-reap

CLI para Node.js que detecta y limpia procesos huérfanos dejados por
herramientas de codificación con IA: **Claude Code, Cursor, Codex, Aider y
Gemini CLI**. Funciona en Windows, macOS y Linux.

## El problema

Estas herramientas lanzan servidores MCP y subagentes como procesos hijos.
Cuando la sesión termina mal —cierras la terminal, el proceso padre cuelga,
el sistema entra en suspensión— esos hijos no reciben la señal de cierre y
quedan huérfanos: siguen vivos, consumiendo memoria y CPU, sin nada que los
limpie. Con el tiempo se acumulan y hay que ir matándolos a mano, con el
riesgo de matar por error un proceso legítimo que no tiene nada que ver.

## Qué hace mcp-reap

- **Soporte real en Windows, macOS y Linux** — no solo detección: también
  limpieza, con la escalada de señales adaptada a cada sistema (SIGTERM/
  SIGKILL en Unix, `taskkill` sin/con `/F` en Windows).
- **Reconoce Claude Code, Cursor, Codex, Aider y Gemini CLI** por firma de
  proceso, más un fallback genérico para servidores MCP que no coincidan
  con ninguna herramienta conocida.
- **Cero dependencias externas** — solo Node.js nativo (`/proc` en Linux,
  `ps` en macOS, `Get-CimInstance Win32_Process` vía PowerShell en
  Windows).
- **Dry-run por defecto siempre** — `clean` nunca mata nada salvo que
  pases `--yes` explícitamente.
- **Revalidación de PID antes de matar** — justo antes de actuar,
  comprueba que el PID sigue siendo el mismo proceso huérfano detectado
  (compara su timestamp de arranque), para no matar un PID reciclado por
  un proceso nuevo y legítimo.
- **Lista blanca configurable** — protege procesos concretos aunque
  coincidan con una firma de herramienta de IA.

## Instalación

```bash
# Instalación global
npm install -g mcp-reap

# O sin instalar nada, al vuelo
npx mcp-reap scan
```

El binario se instala como `mcp-reap`, con `mzg` como alias corto.

## Uso

### `scan` — solo detecta, no toca nada

```bash
mcp-reap scan          # tabla legible
mcp-reap scan --json   # mismo resultado en JSON
```

Lista los procesos huérfanos detectados: PID, herramienta a la que
pertenecen (o "servidor MCP no identificado" si no coincide con ninguna
firma conocida), y por qué se consideran huérfanos (padre ausente, ppid
reparentado a init, reparentado al manager systemd --user (Linux), o PID
de padre reciclado por un proceso más nuevo).
`scan` es de solo lectura siempre — nunca mata nada.

### `clean` — limpia, con dry-run por defecto

```bash
mcp-reap clean                    # dry-run: solo muestra qué mataría
mcp-reap clean --yes              # mata de verdad los huérfanos detectados
mcp-reap clean --yes --timeout=5  # espera 5s tras SIGTERM antes de forzar SIGKILL
```

**`clean` sin `--yes` nunca mata ningún proceso** — solo imprime lo que
haría, igual que `scan` pero con la acción propuesta. Necesitas pasar
`--yes` explícitamente para que mate algo de verdad. Cuando lo hace:

1. Revalida justo antes de actuar que el PID sigue siendo el mismo proceso
   huérfano detectado (compara su timestamp de arranque), para no matar un
   PID reciclado por un proceso nuevo y legítimo.
2. Envía SIGTERM (o `taskkill` sin `/F` en Windows) y espera el timeout
   configurado (10s por defecto).
3. Si el proceso sigue vivo, escala a SIGKILL (`taskkill /F` en Windows).
4. Respeta la lista blanca configurable — nunca mata un proceso que
   coincida con un patrón en `~/.mzg/config.json`.
5. Registra cada acción real en `~/.mzg/clean.log` (no se escribe nada en
   dry-run).

### Lista blanca

```bash
mcp-reap init   # crea ~/.mzg/config.json con una plantilla vacía
```

Edita el campo `whitelist` (array de patrones/regex) para proteger
procesos concretos aunque coincidan con una firma conocida de herramienta
de IA.

### Modo `--demo`

```bash
mcp-reap scan --demo
mcp-reap clean --demo
mcp-reap clean --demo --yes
```

Corre la misma lógica de detección y limpieza sobre un snapshot de
procesos simulado en vez de los procesos reales de tu sistema. Es útil
para ver cómo se comporta la herramienta (incluida la escalada a SIGKILL)
sin ningún riesgo: en modo demo nunca se llama a `process.kill` real, así
que ningún proceso de tu máquina puede resultar afectado.

## Seguridad

- Dry-run por defecto siempre en `clean`; solo `--yes` mata procesos.
- Verificación de que el proceso padre está realmente muerto antes de
  considerar huérfano a un proceso.
- Revalidación anti-PID-reciclado justo antes de matar.
- SIGTERM primero, espera configurable, SIGKILL solo si no responde.
- Lista blanca configurable para excluir procesos concretos.
- Cero dependencias externas (solo Node.js nativo).

## Alternativas

Si solo usas Claude Code en macOS o Linux, [cc-reaper](https://github.com/theQuert/cc-reaper) es otra opción:
cubre únicamente esa herramienta en esas dos plataformas, pero ofrece más
automatización en segundo plano (daemon + hook de `Stop`) para quien no
necesite nada más que eso.

## Licencia

MIT
