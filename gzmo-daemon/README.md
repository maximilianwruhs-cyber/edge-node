# GZMO Daemon v0.3.0 — Smart Core

A sovereign, local-first AI daemon that turns your Obsidian Vault into an intelligent folder. No cloud APIs. No subscriptions. Just markdown files and a heartbeat.

## What It Does

Drop a `.md` file in `GZMO/Inbox/` → the daemon reads it, thinks, searches your vault, and writes the answer back into the same file. It dreams autonomously, remembers across tasks, and never sedates itself.

## Quick Start

```bash
# 1. Install dependencies
cd gzmo-daemon && bun install

# 2. Copy config
cp .env.example .env
# Edit .env with your vault path

# 3. Start Ollama (optimized for GTX 1070)
OLLAMA_KV_CACHE_TYPE=q8_0 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KEEP_ALIVE=-1 ollama serve

# 4. Pull required models
ollama pull hermes3:8b
ollama pull nomic-embed-text

# 5. Start the daemon
bun start
```

## Task Actions

Tasks are markdown files with YAML frontmatter. The `action:` field controls behavior:

### `action: think` (default)
Direct LLM inference. The daemon answers your question.

```yaml
---
status: pending
action: think
---

Explain the Lorenz attractor in 3 bullet points.
```

### `action: search`
Searches your vault for relevant context before answering. Uses nomic-embed-text embeddings (768d vectors) with cosine similarity.

```yaml
---
status: pending
action: search
---

What optimization decisions were made for the GTX 1070?
```

### `action: chain`
Output feeds into the next task. Use `chain_next:` to specify the follow-up file.

```yaml
---
status: pending
action: chain
chain_next: step_2.md
---

Summarize all research on speculative decoding.
```

## Architecture

```
┌─────────────────────────────────────────────┐
│              GZMO Daemon v0.3.0             │
│                                             │
│  PulseLoop (174 BPM)                        │
│  ├── Lorenz Attractor (RK4)                 │
│  ├── Logistic Map coupling                  │
│  ├── Thought Cabinet crystallization        │
│  ├── Allostasis (simulated cortisol)        │
│  └── Trigger Engine → Live_Stream.md        │
│                                             │
│  VaultWatcher (chokidar)                    │
│  └── Inbox/*.md → Task Router               │
│      ├── think → LLM inference              │
│      ├── search → Vault RAG → LLM          │
│      └── chain → LLM → next task           │
│                                             │
│  EmbeddingPipeline (nomic-embed-text)       │
│  ├── Boot sync (SHA256 dedup)               │
│  └── Live sync (wiki watcher)              │
│                                             │
│  TaskMemory (rolling 5-task log)            │
│  DreamEngine (30-min distillation)          │
│  SelfAskEngine (Gap detective, contradictions)│
│  WikiEngine (knowledge consolidation & self-doc)│
└─────────────────────────────────────────────┘
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VAULT_PATH` | **required** | Absolute path to Obsidian Vault |
| `OLLAMA_MODEL` | `hermes3:8b` | Model for inference |
| `OLLAMA_URL` | `http://localhost:11434/v1` | Ollama API endpoint |
| `OLLAMA_KV_CACHE_TYPE` | `f16` | KV cache quantization (`q8_0` recommended) |
| `OLLAMA_FLASH_ATTENTION` | `0` | Flash attention (`1` = enabled) |
| `OLLAMA_KEEP_ALIVE` | `5m` | Model keep-alive (`-1` = forever) |

## Vault Structure

```
Obsidian_Vault/
├── GZMO/
│   ├── Inbox/              ← Drop tasks here
│   ├── Thought_Cabinet/    ← Dream crystallizations
│   ├── Live_Stream.md      ← Real-time daemon log
│   ├── CHAOS_STATE.json    ← Lorenz attractor state
│   ├── embeddings.json     ← Vector store (nomic-embed-text)
│   └── memory.json         ← Episodic task memory
└── wiki/
    ├── research/           ← Embedded research notes
    ├── sessions/           ← Distilled session logs
    └── ...                 ← All .md files are searchable
```

## Source Files (2,508 LOC)

| File | LOC | Purpose |
|------|-----|---------|
| `pulse.ts` | 323 | PulseLoop — 174 BPM heartbeat orchestrator |
| `wiki_engine.ts` | 235 | Autonomous knowledge consolidation & self-doc |
| `embeddings.ts` | 282 | Vault embedding pipeline (nomic-embed-text) |
| `dreams.ts` | 268 | Autonomous dream distillation engine |
| `self_ask.ts` | 225 | Autonomous self-interrogation & spaced repetition |
| `engine.ts` | 196 | Task processor with action routing |
| `thoughts.ts` | 187 | Thought Cabinet (Disco Elysium-style) |
| `triggers.ts` | 168 | Edge-triggered autonomous events |
| `types.ts` | 140 | Shared type definitions |
| `chaos.ts` | 126 | Lorenz attractor + Logistic map |
| `watcher.ts` | 118 | File watcher (chokidar) with debounce |
| `allostasis.ts` | 111 | Anti-sedation cortisol system |
| `engine_state.ts` | 97 | Energy/Phase/Death state machine |
| `skills.ts` | 93 | Wiki skills discovery |
| `search.ts` | 88 | Cosine similarity vault search |
| `feedback.ts` | 88 | Bidirectional chaos event channel |
| `memory.ts` | 84 | Rolling episodic task memory |
| `frontmatter.ts` | 81 | YAML frontmatter parser/writer |
| `stream.ts` | 58 | LiveStream.md writer |

## Auto-Start (systemd)

```bash
# Install the service
sudo cp gzmo-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable gzmo-daemon
sudo systemctl start gzmo-daemon

# Check status
sudo systemctl status gzmo-daemon
journalctl -u gzmo-daemon -f
```

## Hardware Tested

- **GTX 1070** (8GB VRAM) — hermes3:8b at ~20 tok/s
- **24+ hours** verified uptime, 0 crashes
- **2,065 chunks** embedded
- **nomic-embed-text** (274 MB) fits alongside hermes3:8b in VRAM

## Version History

- **v0.4.0** — Sovereign Core: WikiEngine consolidation, Self-Ask Engine
- **v0.3.0** — Smart Core: allostasis, vault RAG, task routing, episodic memory
- **v0.2.0** — Chaos Edition: streaming inference, KV cache optimization
- **v0.1.0** — Initial port from OpenClaw plugin to sovereign Bun daemon
