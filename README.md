# Edge Node: Sovereign Agent Stack

A bare-metal, zero-trust AI agent environment. Designed for hardware-adaptive deployment and complete local sovereignty — no cloud dependencies for core inference.

## Core Tenets
1. **Absolute Sovereignty**: Zero telemetry, no cloud accounts for core inference. Everything runs on your hardware.
2. **Immutable Infrastructure**: All dependencies packaged in Docker. If the node loses internet, it still boots.
3. **Hardware Adaptive**: `install_node.sh` auto-detects your GPU and selects the optimal model. From Pascal to Blackwell.
4. **Self-Evolution**: The Chaos Engine drives autonomous identity evolution through Dreams, Research, and a live heartbeat pulse.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    GZMO Edge Node                          │
├──────────────────────────┬─────────────────────────────────┤
│   OpenClaw Gateway       │   Chaos Engine (Plugin)         │
│   Agent Orchestrator     │   ┌─────────────────────┐      │
│   host-network           │   │ PulseLoop (174 BPM)  │     │
│                          │   │ DreamEngine          │      │
│   ┌───────────────┐      │   │ ResearchEngine       │     │
│   │ Telegram Bot  │      │   │ Ollama Proxy (:11435)│     │
│   │ MCP: vault+qmd│      │   └─────────────────────┘      │
│   │ ACP Bridge    │      │                                 │
│   └───────────────┘      │   Model: Gemini 2.5 Flash      │
│                          │          (Cloud API)            │
├──────────────────────────┴─────────────────────────────────┤
│  Obsidian Vault (wiki + dreams + raw sources)              │
│  qmd Hybrid Search (BM25 + vector + LLM reranking)        │
└────────────────────────────────────────────────────────────┘
Optional: Ollama Engine (local inference, --profile local)
```

### Services
1. **OpenClaw Gateway** — Agent orchestrator with Telegram integration, MCP servers (filesystem + qmd hybrid search), and ACP bridge to host IDE.
2. **Chaos Engine** — OpenClaw plugin providing autonomous heartbeat (PulseLoop), identity evolution (DreamEngine), grounded web research (ResearchEngine), and behavioral modulation via the Thought Cabinet.
3. **Ollama Engine** *(optional, `--profile local`)* — Model-agnostic local inference, GPU-accelerated via NVIDIA Container Toolkit.

### Knowledge Layer
- **Obsidian Vault** — Persistent wiki maintained by GZMO (entities, concepts, topics) + raw source archive
- **qmd Hybrid Search** — BM25 + vector + LLM reranking with 3 micro-LLMs

### Chaos Engine
The Chaos Engine is the agent's autonomous nervous system:

| Component | Purpose |
|-----------|---------|
| **PulseLoop** | Self-correcting heartbeat at 174 BPM. Tracks tension, energy, phase. Dispatches triggers (dreams, research, identity check). |
| **DreamEngine** | Reflects on recent chat sessions, writes dream proposals to `wiki/dreams/`. |
| **ResearchEngine** | Grounded web research via Gemini with search tools. Budget-capped at 15k tokens/day. |
| **Thought Cabinet** | Stochastic thought absorption system. Thoughts incubate before crystallizing into behavioral influence. |

### Dreams & Identity Evolution
The agent proposes identity changes ("Dreams") into `Obsidian_Vault/wiki/dreams/`. The User reviews and merges them into core identity files (`SOUL.md`, `AGENTS.md`).

## Quick Start

### Prerequisites
- **Software**: Docker + Docker Compose
- **Accounts**: Telegram bot token (from [@BotFather](https://t.me/BotFather)), Gemini API key
- **Optional**: NVIDIA GPU + Container Toolkit (for local Ollama inference)

### Deployment

```bash
# Clone and run the setup wizard
git clone <repo-url> edge-node && cd edge-node
./install_node.sh
```

The wizard will:
1. **Detect your GPU** (if present)
2. **Ask for your config** (Vault path, Telegram token, API keys)
3. **Generate all configs** (`.env`, `openclaw.json`)
4. **Launch the stack** and verify health

### Manual Setup (without wizard)

```bash
cp .env.example .env
# Edit .env with your values
docker compose up -d
```

## Node CLI

The `node.sh` script is your single entrypoint for all operations:

```bash
./node.sh              # Status dashboard (container, Chaos Engine, triggers, GPU)
./node.sh logs 100     # Show last 100 log lines
./node.sh restart      # Restart the stack
./node.sh sync         # Sync chaos-engine source → container (after code edits)
./node.sh shell        # Open shell in container
./node.sh chaos        # Show Chaos Engine state (JSON)
./node.sh research     # Show research budget (JSON)
./node.sh stop         # Stop the stack
./node.sh start        # Start the stack
```

## Connecting your IDE (ACP Bridge)

1. Install an ACP-compatible extension in VS Code (e.g., Cline or RooCode)
2. Set the API Provider to "Local/ACP Connection"
3. Set the Address to `ws://127.0.0.1:18789`
4. Enter the `OPENCLAW_AUTH_TOKEN` from `.env` to authenticate

## Files & Directories

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | Stack definition (OpenClaw + optional Ollama) |
| `install_node.sh` | Hardware-sensing setup wizard |
| `node.sh` | Unified CLI for daily operations |
| `core_identity/` | SOUL.md, MEMORY.md — agent personality & memory |
| `extensions/chaos-engine/` | Chaos Engine plugin source |
| `config/` | OpenClaw runtime config (gitignored) |
| `.env` | Secrets & paths (gitignored) |
| `.env.example` | Template for new deployments |
| `config.example.json` | OpenClaw config template |

## Security

Edge Node operates under zero-trust:
- `.env` and `config/` are gitignored — secrets never leak
- `install_node.sh` generates cryptographic auth tokens
- All ports bound to `127.0.0.1` only
- External access only through Telegram bot (authenticated)

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `API rate limit reached` | Gemini RPM quota exceeded (burst of tool calls) | Wait 60s, or upgrade to paid tier with higher RPM |
| `suspicious ownership` error | Plugin files have wrong UID after `docker cp` | Run `./node.sh sync` (handles chown automatically) |
| `chaos_propose_dream` fails | LLM passed undefined args | Already fixed with null guards — restart: `./node.sh restart` |
| `Both GOOGLE_API_KEY and GEMINI_API_KEY set` | Duplicate key in `.env` | Remove `GOOGLE_API_KEY` line from `.env` |

## Heritage

This project fuses hardware-sensing logic from [Phantom Drive](../phantom-drive-build/) (PCI ID hex-matching, VRAM-adaptive model selection) with the sovereign agent architecture of the GZMO Edge Node.

## License
MIT License. See `LICENSE` for details.
