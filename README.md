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

## Por qué existe

Ya existe [zclean](https://github.com/TheStack-ai/zclean) (43 estrellas,
sin mantenimiento desde marzo) para este mismo problema, pero cubre un solo
caso de uso: una máquina, un usuario. `mcp-reap` toma la misma idea de base
y la diferencia en dos frentes:

- **Mantenimiento activo.** zclean lleva meses sin commits; `mcp-reap` es
  la continuación viva de esa idea.
- **Roadmap multi-máquina/equipo.** Detectar y limpiar huérfanos en tu
  propia laptop es solo la mitad del problema cuando un equipo comparte
  máquinas de desarrollo o runners de CI. Ese soporte multi-máquina es el
  diferenciador de fondo que zclean no cubre y que `mcp-reap` tiene en su
  hoja de ruta.

Aparte de eso, `mcp-reap` reconoce más herramientas (no solo Claude Code) y
funciona también en Windows.

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
reparentado a init, o PID de padre reciclado por un proceso más nuevo).
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

## Licencia

MIT
