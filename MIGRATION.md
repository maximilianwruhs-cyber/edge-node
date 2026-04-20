# Migration to New Hardware

## 1-Minute Deploy

```bash
git clone <repo-url> edge-node && cd edge-node
./install_node.sh
```

`install_node.sh` detects your GPU, selects the optimal model (or uses Gemini Cloud), generates all configs, and launches the stack.

## What Happens Automatically

| Step | What |
|------|------|
| Hardware Probe | GPU architecture (Pascal→Blackwell), VRAM, Compute Capability |
| Mode Selection | Gemini Cloud (default) or Ollama Local (GPU-adaptive) |
| Config Generation | `.env` and `config/openclaw.json` generated dynamically |
| Stack Launch | `docker compose up -d` (+ model pull for Ollama mode) |
| Health Check | Waits until Gateway responds |

## Data Migration

### Obsidian Vault (Knowledge Base)
The vault contains GZMO's entire knowledge (wiki, dreams, raw sources). Copy it to the new machine and provide the path during install.

### core_identity/ (Personality)
Comes automatically via Git — SOUL.md, MEMORY.md, AGENTS.md, etc.

### Chaos Engine State
The following files contain runtime state and can be optionally migrated:
- `CHAOS_STATE.json` — current heartbeat snapshot (tension, energy, phase)
- `RESEARCH_BUDGET.json` — daily research token budget
- `CHAOS_TRIGGERS.log` — trigger event history
- `CHAOS_DREAMS_DIGESTED.json` — processed dream session IDs

These files live in `/workspace/` inside the container. Fresh starts will recreate defaults.

### qmd Search Index
Must be rebuilt on the new machine:

```bash
npm install -g @tobilu/qmd
qmd collection add /path/to/Obsidian_Vault/wiki --name wiki
qmd collection add /path/to/Obsidian_Vault/raw --name raw
qmd embed
```

### Telegram Bot
The same bot token works on any machine. Enter it in `.env` (or `install_node.sh` asks for it).

## Reconfigure (Without Reinstall)

```bash
./install_node.sh --reconfigure
```

Useful after a GPU upgrade: detects new hardware, suggests a better model, regenerates configs.

## Dry Run (Preview Only)

```bash
./install_node.sh --dry-run
```

Shows what would be configured without making any changes.

## Daily Operations

After migration, use the unified CLI:

```bash
./node.sh              # Status dashboard
./node.sh logs         # View logs
./node.sh restart      # Restart stack
./node.sh sync         # Sync chaos-engine code changes
```
