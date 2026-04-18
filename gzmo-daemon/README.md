# GZMO Daemon — Chaos Edition v0.2.0

A sovereign, local-first AI daemon that processes Obsidian Vault tasks with a chaos-driven heartbeat.

## Quick Start

```bash
bun install
```

### 1. Start Ollama (optimized)

```bash
OLLAMA_KV_CACHE_TYPE=q8_0 OLLAMA_FLASH_ATTENTION=1 ollama serve
```

### 2. Start the Daemon

```bash
OLLAMA_MODEL=qwen2.5:3b VAULT_PATH=~/Dokumente/Playground/DevStack_v2/Obsidian_Vault bun run index.ts
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_MODEL` | `qwen2.5:3b` | Model to use for inference |
| `VAULT_PATH` | required | Path to Obsidian Vault |
| `OLLAMA_URL` | `http://localhost:11434/v1` | Ollama API endpoint |
| `OLLAMA_KV_CACHE_TYPE` | `f16` | KV cache quantization (`q8_0` saves ~50% VRAM) |
| `OLLAMA_FLASH_ATTENTION` | `0` | Flash attention (`1` = enabled) |

## How It Works

1. Drop a `.md` file with `status: pending` in frontmatter into `GZMO/Inbox/`
2. Daemon picks it up, sets `status: processing`, runs inference
3. Response appended to the file, `status: completed`
4. Dream Engine reflects on completed tasks every 30 minutes

## Architecture

- **PulseLoop**: 174 BPM heartbeat driving the Lorenz attractor
- **ThoughtCabinet**: Disco Elysium-style thought crystallization
- **TriggerEngine**: Edge-triggered events → file writes only (never APIs)
- **DreamEngine**: Autonomous reflection via local Ollama
- **SkillsDiscovery**: Scans `wiki/skills/` for injectable context

## Hardware Tested

- GTX 1070 (8GB VRAM) — qwen2.5:3b at 65 tok/s, 2s per task
- 13+ hours verified uptime, 0 crashes, 0 deaths
