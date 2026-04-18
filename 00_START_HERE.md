# GZMO Edge Node — Start Here

> A sovereign, local-first AI daemon that turns an Obsidian Vault into an intelligent, self-maintaining folder OS. No cloud APIs. No subscriptions. Markdown files in, enriched markdown out.

## What This Is

Two components:

1. **`edge-node/`** — The infrastructure: Docker-based OpenClaw agent stack with Telegram integration, Ollama local inference, and hardware-adaptive setup wizard.
2. **`edge-node/gzmo-daemon/`** — The daemon: A Bun/TypeScript process with a Lorenz-attractor chaos engine at 174 BPM, vault RAG via nomic-embed-text, autonomous dream distillation, and allostatic stress regulation.
3. **`Obsidian_Vault/`** — The knowledge base: 459 markdown files across wiki, research, session distills, and autonomous dream crystallizations. This is what the daemon reads, searches, and writes to.

## Quickest Path to Running

### Prerequisites

```bash
# Bun (TypeScript runtime)
curl -fsSL https://bun.sh/install | bash

# Ollama (local LLM inference)
curl -fsSL https://ollama.com/install.sh | sh

# Pull required models
ollama pull qwen2.5:3b          # 3B param inference model (~2 GB)
ollama pull nomic-embed-text    # Embedding model for vault search (~274 MB)
```

### Start the Daemon (5 minutes)

```bash
cd edge-node/gzmo-daemon

# Install dependencies
bun install

# Configure
cp .env.example .env
# Edit .env → set VAULT_PATH to the absolute path of the Obsidian_Vault/ directory

# Start Ollama with performance flags
OLLAMA_KV_CACHE_TYPE=q8_0 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KEEP_ALIVE=-1 ollama serve &

# Start the daemon
bun start
```

You should see:
```
═══════════════════════════════════════════════
  GZMO Daemon v0.3.0 — Smart Core
  ⚡ Chaos Engine + Allostasis + Vault RAG
═══════════════════════════════════════════════
[PULSE] Started at 174 BPM (345ms, self-correcting)
[EMBED] Sync complete: 1280 new, 0 cached, 1280 total
[WATCHER] Watching: .../GZMO/Inbox
```

### Test It

Drop a markdown file into `Obsidian_Vault/GZMO/Inbox/`:

```bash
cat > ../Obsidian_Vault/GZMO/Inbox/test.md << 'EOF'
---
status: pending
action: search
---

What is the dark room problem and how does allostasis prevent it?
EOF
```

Within ~5 seconds, the daemon will:
1. Detect the file
2. Search the vault for relevant context (1,280 embedded chunks)
3. Run inference via Ollama
4. Write the response back into the same file
5. Update frontmatter: `status: completed`

Check the result: `cat ../Obsidian_Vault/GZMO/Inbox/test.md`

### Task Actions

| Frontmatter `action:` | Behavior |
|------------------------|----------|
| `think` (default) | Direct LLM inference |
| `search` | Vault RAG → context injection → LLM |
| `chain` | Output saved, `chain_next:` file auto-created |

### Auto-Start (systemd)

```bash
# Edit gzmo-daemon.service paths for your system
sudo cp gzmo-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gzmo-daemon
journalctl -u gzmo-daemon -f
```

---

## Full Stack (Docker + OpenClaw + Telegram)

For the complete agent stack with Telegram bot, OpenClaw gateway, and MCP:

```bash
cd edge-node
./install_node.sh
```

This runs an interactive wizard that:
- Detects your GPU architecture (Pascal→Blackwell)
- Selects the optimal model for your VRAM
- Generates `.env` and `config/openclaw.json`
- Deploys via Docker Compose

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    GZMO Daemon v0.3.0                         │
│                                                                │
│  PulseLoop (174 BPM heartbeat)                                │
│  ├── Lorenz Attractor (RK4 integration, σ=10 ρ=28 β=8/3)    │
│  ├── Logistic Map coupling (r=3.99, reseeded every 10 ticks) │
│  ├── Thought Cabinet (5-slot Disco-Elysium crystallization)   │
│  ├── Allostasis (simulated cortisol, anti-sedation CDA)       │
│  ├── Engine State (energy/phase/death lifecycle)              │
│  └── Trigger Engine → Live_Stream.md (NEVER to APIs)          │
│                                                                │
│  VaultWatcher (chokidar, 500ms debounce)                      │
│  └── Inbox/*.md → Engine → Task Router                        │
│      ├── think  → system prompt + LLM                        │
│      ├── search → embed query → cosine sim → top-3 → LLM    │
│      └── chain  → LLM → write chain_next file               │
│                                                                │
│  EmbeddingPipeline (nomic-embed-text, 768d)                   │
│  ├── Boot: scan vault → SHA256 dedup → embed new chunks      │
│  └── Live: chokidar on wiki/ + Thought_Cabinet/              │
│                                                                │
│  DreamEngine (30-min autonomous reflection cycle)             │
│  └── completed tasks → Ollama reflect → Thought_Cabinet/     │
│                                                                │
│  TaskMemory (rolling 5-task episodic memory)                  │
│  └── injected into system prompt for cross-task continuity    │
└────────────────────────────────────────────────────────────────┘
```

## Source Files (17 files, ~2,500 LOC TypeScript)

| File | Purpose |
|------|---------|
| `index.ts` | Entry point, wires all subsystems |
| `src/pulse.ts` | PulseLoop — 174 BPM heartbeat orchestrator |
| `src/chaos.ts` | Lorenz attractor + Logistic map |
| `src/thoughts.ts` | Thought Cabinet crystallization system |
| `src/allostasis.ts` | Anti-sedation cortisol regulator |
| `src/engine.ts` | Task processor with action routing |
| `src/engine_state.ts` | Energy/Phase/Death state machine |
| `src/embeddings.ts` | Vault embedding pipeline |
| `src/search.ts` | Cosine similarity vault search |
| `src/dreams.ts` | Autonomous dream distillation |
| `src/memory.ts` | Rolling episodic task memory |
| `src/triggers.ts` | Edge-triggered autonomous events |
| `src/feedback.ts` | Bidirectional chaos event channel |
| `src/skills.ts` | Wiki skills discovery |
| `src/watcher.ts` | File watcher with debounce |
| `src/frontmatter.ts` | YAML frontmatter parser/writer |
| `src/stream.ts` | LiveStream.md buffered writer |

## Vault Structure

```
Obsidian_Vault/
├── GZMO/
│   ├── Inbox/              ← Drop tasks here (daemon watches this)
│   ├── Thought_Cabinet/    ← Autonomous dream crystallizations
│   ├── Subtasks/           ← Chain task outputs
│   ├── Live_Stream.md      ← Real-time daemon log (open in Obsidian)
│   ├── CHAOS_STATE.json    ← Lorenz attractor snapshot (generated)
│   ├── embeddings.json     ← Vector store (generated on first boot)
│   ├── memory.json         ← Episodic task memory (generated)
│   └── *.md templates      ← Task templates for Obsidian
├── wiki/
│   ├── research/           ← NotebookLM research exports
│   ├── sessions/           ← Distilled session logs (11 notes)
│   ├── skills/             ← Discoverable skill procedures
│   └── ...                 ← All .md files are searchable via RAG
└── ...
```

## Hardware Tested

- **GPU**: NVIDIA GTX 1070 (8 GB VRAM, Pascal architecture)
- **Inference**: qwen2.5:3b at ~65 tok/s, ~5 seconds per task
- **Uptime**: 13+ hours verified, 0 crashes
- **Embeddings**: 1,280 chunks (19.8 MB vector store)
- **VRAM**: qwen2.5:3b (2.5 GB) + nomic-embed-text (274 MB) fit together

## Version History

| Version | Commit | Changes |
|---------|--------|---------|
| v0.3.0 | `fde0687` | Smart Core: allostasis, vault RAG, task routing, episodic memory |
| v0.2.0 | `72b28ce` | Chaos Edition: streaming inference, KV cache optimization |
| v0.1.0 | — | Initial port from OpenClaw plugin to sovereign Bun daemon |
