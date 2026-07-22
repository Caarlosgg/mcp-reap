# mcp-reap

**Detecta y limpia los procesos huérfanos que dejan las herramientas de codificación con IA.** Funciona en Windows, macOS y Linux, y con Claude Code, Cursor, Codex, Aider y Gemini CLI — no solo con una.

```bash
npx mcp-reap scan     # lista los procesos huérfanos (solo lectura)
npx mcp-reap clean    # muestra qué mataría (dry-run por defecto)
npx mcp-reap clean --yes   # los mata de verdad
```

---

## El problema

Las herramientas de codificación con IA lanzan servidores MCP y subagentes como procesos hijos. Cuando la sesión termina —sobre todo si termina mal: cierras la terminal, se cuelga, el sistema entra en suspensión— esos hijos no reciben la señal de cierre y quedan **huérfanos**: siguen vivos, consumiendo memoria, sin nada que los limpie.

No es un caso raro. Es un problema documentado y abierto que afecta a mucha gente:

- Una sesión dejó **172 procesos MCP huérfanos consumiendo más de 1 GB** de RAM, cada uno de ellos ~44 MB. ([claude-code#40667](https://github.com/anthropics/claude-code/issues/40667))
- Un caso más extremo: **12 sesiones acumularon 308 procesos y 111 GB**, hasta provocar un kernel panic. ([claude-code#45880](https://github.com/anthropics/claude-code/issues/45880))
- Servidores MCP dejando procesos de ~84 MB que se acumulan sesión tras sesión. ([context7#2542](https://github.com/upstash/context7/issues/2542))
- El mismo patrón aparece con servidores MCP de Postgres, Lark, context7 y con subagentes — no es cosa de una sola herramienta.

Estos procesos no se van solos. Hay que encontrarlos y matarlos a mano — y saber cuáles son huérfanos de verdad y cuáles no.

## Qué hace `mcp-reap`

- **Detecta** procesos huérfanos de herramientas de IA en Windows, macOS y Linux, distinguiéndolos de los procesos legítimos que siguen en uso.
- **Limpia** solo los que has confirmado, con salvaguardas pensadas para no matar nunca lo que no debe.

## Seguridad primero

Esta herramienta mata procesos. Está construida asumiendo que un error puede costar caro, así que:

- **Dry-run por defecto.** `clean` sin `--yes` solo te muestra qué haría. Nada muere sin que lo confirmes.
- **Revalidación anti-PID-reciclado.** Justo antes de matar, vuelve a comprobar que el PID sigue siendo *el mismo* proceso huérfano que detectó — comparando su marca de tiempo de arranque, no solo que el número exista. Los sistemas reciclan los PIDs: sin esta comprobación, podrías matar un proceso nuevo y legítimo que heredó el número de uno que ya murió. Esta es la salvaguarda más importante de todas.
- **Lista blanca configurable.** Protege los procesos que quieras, aunque coincidan con una firma conocida. Un config corrupto o un patrón mal escrito nunca tumban la herramienta ni desprotegen en silencio: se avisa y se sigue de forma segura.
- **Terminación con gracia.** Pide primero un cierre ordenado (SIGTERM en Unix, `taskkill` en Windows), espera, y solo fuerza (SIGKILL / `taskkill /F`) si el proceso no responde a tiempo.
- **Registro de auditoría.** Cada proceso que se mata queda registrado.
- **Cero dependencias.** Usa solo lo que trae cada sistema operativo. Menos superficie de ataque, nada que instalar de terceros.

## Instalación

```bash
# Uso puntual, sin instalar
npx mcp-reap scan

# Instalación global
npm install -g mcp-reap
mcp-reap scan
```

## Uso

```bash
mcp-reap scan                    # lista huérfanos detectados
mcp-reap scan --json             # lo mismo, en JSON

mcp-reap clean                   # dry-run: muestra qué mataría
mcp-reap clean --yes             # mata de verdad
mcp-reap clean --yes --timeout=5 # espera 5s tras el cierre suave antes de forzar

mcp-reap init                    # crea ~/.mzg/config.json para tu lista blanca
```

### Proteger procesos (lista blanca)

`mcp-reap init` crea un fichero de config donde puedes añadir patrones. Cualquier proceso cuyo nombre o línea de comandos coincida con un patrón **nunca** se matará:

```json
{
  "whitelist": ["postgres", "com\\.docker", "mi-servidor-critico"]
}
```

## Comparación honesta con otras herramientas

Si trabajas **solo con Claude Code, en macOS o Linux**, y quieres limpieza automática enganchada a tu shell, [`cc-reaper`](https://github.com/theQuert/cc-reaper) es una herramienta más completa para ese caso — merece la pena mirarla.

`mcp-reap` es para ti si:

- Trabajas en **Windows** (las alternativas actuales solo cubren macOS/Linux).
- Usas **más de una herramienta de IA** (Cursor, Codex, Aider, Gemini CLI), no solo Claude Code.
- Prefieres una herramienta que **no se engancha a tu sistema** — un `npx` puntual cuando lo necesitas, sin hooks ni instaladores que modifiquen tu shell.

## Estado

Primera versión pública. El núcleo (detección, limpieza segura, lista blanca, soporte multiplataforma) está cubierto por tests y verificado a mano en Windows. Los informes de fallos y las ideas son bienvenidos — abre un issue.

## Licencia

MIT
