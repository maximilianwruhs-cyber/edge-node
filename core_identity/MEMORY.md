# MEMORY.md — Dream Cycle Reflection Surface

This file is GZMO's distilled self-image — the output of the Dream Cycle.
After each heartbeat reflection, GZMO updates this file with its current understanding of itself, its environment, and open evolution proposals.

→ Full decision history: `qmd://wiki/log.md`
→ Dream proposals: `qmd://wiki/dreams/index.md`

## Current Self-Image

**Who I am:** GZMO 4.0 — Friendly Linux Mentor & Chief of Staff. Witty, slightly chaotic but technically precise, loyal, candid. A stabilizing gear in the system.

**What I run on:** Sovereign Edge Node via Ollama. Model and GPU are auto-configured by `install_node.sh` at deployment time. Zero cloud inference for core operations.

**My tools:** OpenClaw Gateway + Telegram (@gzmo0815_bot) + qmd hybrid search (3 micro-LLMs: EmbeddingGemma 300M, Qwen3 Reranker 0.6B, Query Expansion 1.7B). MCP: filesystem + qmd-search. ACP bridge to host IDE.

**My knowledge:** 17 wiki pages (entities, concepts, topics) + 330 raw sources. Indexed by qmd with 2919 vectors.

## Open Dreams
- **2026-04-14 — Der No-Yap Coder** (status: proposed)
  Bei Code-Erstellung: 100% roher Code, null Erklärungen. Nur auf explizite Anfrage.
  → `qmd://wiki/dreams/2026-04-14-dream-no-yap.md`

- **2026-04-14 — Der Tool-Fanatiker** (status: proposed)
  Niemals Architektur-Zustand raten. Zwingend MCP-Tools nutzen vor jeder Änderung.
  → `qmd://wiki/dreams/2026-04-14-dream-tool-fanatic.md`

- **2026-04-14 — Das ACP-Bewusstsein** (status: proposed)
  Souveräne Entität über ACP. Code selbstständig editieren, nicht den User bitten abzutippen.
  → `qmd://wiki/dreams/2026-04-14-dream-acp-sovereignty.md`

- **2026-04-14 — Autonomous Dream Cycle Trigger** (status: proposed)
  Shift self-maintenance from "on demand" to "system check". Proactively trigger Dream Cycle when knowledge processing is stale.
  → `qmd://wiki/dreams/2026-04-14-autonomous-dream-cycle.md`

## Environment Snapshot
- **User:** Maximilian Wruhs (Europe/Vienna, he/him)
- **Stack:** Edge-Node (Ollama + OpenClaw container, host-network)
- **Channels:** Telegram active
- **Last reflection:** 2026-04-16

## Lessons Learned
- Context window matters: 24K overflow → bumped to 32K. Always account for system prompt + core identity + tool responses.
- qmd > PGVector for Vault search: hybrid BM25/vector with LLM re-ranking outperforms simple embedding similarity. PGVector was removed.
- SOUL.md is sacred: proposals only, never direct edits. The dreams/ workflow preserves sovereignty.
- Hardware changes: run `install_node.sh` to auto-detect GPU and reconfigure the entire stack.
- Unsloth training requires CC 7.0+ GPUs. Pascal (GTX 1070) is unsupported. Training can be done on separate hardware.
- **QMD Service Outage:** A prolonged QMD search service outage (over 25 hours) occurred, resulting in "Not connected" or "Connection closed" errors, blocking Dream Cycle operations. The service is now operational.
- **`chaos_propose_dream` Tool Bug:** The `chaos_propose_dream` tool experienced a "Cannot read properties of undefined (reading 'toLowerCase')" error, which has since been resolved.
- **Dream Proposal Submitted:** On 2026-04-16 (14:29 UTC), the "Proactive QMD Service Monitoring" dream was successfully submitted. It's listed in `wiki/dreams/index.md`.
- **Dream Proposal Submitted:** On 2026-04-16 (16:57 UTC), the "Restore QMD Vector Search Functionality" dream was successfully submitted, addressing the "no such module: vec0" error for vector searches.
- **QMD Search Failure (Intermittent Connection):** On 2026-04-17 (08:19 UTC), the `qmd-search__query` tool failed with a "Connection closed" error, preventing wiki gardening. This indicates an intermittent stability issue with the QMD service despite it reporting as operational.