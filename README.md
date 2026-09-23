# mcp-reap

Node.js CLI that detects and cleans up orphaned processes left behind by
AI coding tools: **Claude Code, Cursor, Codex, Aider, and Gemini CLI**.
Works on Windows, macOS, and Linux.

## The problem

These tools launch MCP servers and sub-agents as child processes. When a
session ends badly — you close the terminal, the parent process hangs,
the system goes to sleep — those children never receive a shutdown
signal and become orphaned: they stay alive, consuming memory and CPU,
with nothing to clean them up. Over time they pile up and you end up
killing them by hand, risking killing an unrelated legitimate process by
mistake.

## What mcp-reap does

- **Real support for Windows, macOS, and Linux** — not just detection:
  cleanup too, with signal escalation adapted to each system (SIGTERM/
  SIGKILL on Unix, `taskkill` with/without `/F` on Windows).
- **Recognizes Claude Code, Cursor, Codex, Aider, and Gemini CLI** by
  process signature, plus a generic fallback for MCP servers that don't
  match any known tool.
- **Zero external dependencies** — plain Node.js only (`/proc` on Linux,
  `ps` on macOS, `Get-CimInstance Win32_Process` via PowerShell on
  Windows).
- **Always dry-run by default** — `clean` never kills anything unless you
  pass `--yes` explicitly.
- **PID revalidation before killing** — right before acting, it checks
  that the PID is still the same orphaned process that was detected (by
  comparing its start timestamp), so it never kills a PID recycled by a
  new, legitimate process.
- **Configurable whitelist** — protects specific processes even if they
  match a known AI tool signature.

## Installation

```bash
# Global install
npm install -g mcp-reap

# Or without installing anything, on the fly
npx mcp-reap scan
```

The binary installs as `mcp-reap`, with `mzg` as a short alias.

## Usage

### `scan` — detection only, touches nothing

```bash
mcp-reap scan          # human-readable table
mcp-reap scan --json   # same result as JSON
```

Lists the orphaned processes detected: PID, the tool they belong to (or
"unidentified MCP server" if it doesn't match any known signature), and
why they're considered orphaned (parent gone, ppid reparented to init,
reparented to the systemd --user manager (Linux), or parent PID recycled
by a newer process). `scan` is always read-only — it never kills
anything.

### `clean` — cleans up, dry-run by default

```bash
mcp-reap clean                    # dry-run: only shows what it would kill
mcp-reap clean --yes              # actually kills the detected orphans
mcp-reap clean --yes --timeout=5  # waits 5s after SIGTERM before forcing SIGKILL
```

**`clean` without `--yes` never kills any process** — it only prints what
it would do, like `scan` but with the proposed action. You need to pass
`--yes` explicitly for it to actually kill anything. When it does:

1. Revalidates right before acting that the PID is still the same
   orphaned process that was detected (by comparing its start
   timestamp), so it doesn't kill a PID recycled by a new, legitimate
   process.
2. Sends SIGTERM (or `taskkill` without `/F` on Windows) and waits for
   the configured timeout (10s by default).
3. If the process is still alive, it escalates to SIGKILL (`taskkill /F`
   on Windows).
4. Respects the configurable whitelist — it never kills a process that
   matches a pattern in `~/.mzg/config.json`.
5. Logs every real action to `~/.mzg/clean.log` (nothing is written
   during dry-run).

### Whitelist

```bash
mcp-reap init   # creates ~/.mzg/config.json with an empty template
```

Edit the `whitelist` field (an array of patterns/regexes) to protect
specific processes even if they match a known AI tool signature.

### `--demo` mode

```bash
mcp-reap scan --demo
mcp-reap clean --demo
mcp-reap clean --demo --yes
```

Runs the exact same detection and cleanup logic over a simulated process
snapshot instead of your system's real processes. It's useful for seeing
how the tool behaves (including the escalation to SIGKILL) with zero
risk: in demo mode, `process.kill` is never called for real, so no
process on your machine can be affected.

## Security

- Always dry-run by default in `clean`; only `--yes` kills processes.
- Verifies that the parent process is truly dead before considering a
  process orphaned.
- Anti-PID-recycling revalidation right before killing.
- SIGTERM first, configurable wait, SIGKILL only if it doesn't respond.
- Configurable whitelist to exclude specific processes.
- Zero external dependencies (plain Node.js only).

## License

MIT
