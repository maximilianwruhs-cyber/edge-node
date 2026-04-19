/**
 * GZMO Daemon v0.3.0 — Smart Core Edition
 *
 * A sovereign, filesystem-driven AI daemon with:
 * - Lorenz attractor heartbeat + Thought Cabinet crystallization
 * - Allostatic stress system (anti-sedation via simulated cortisol)
 * - Vault search via nomic-embed-text embeddings
 * - Episodic task memory for cross-task continuity
 * - Task routing via action: frontmatter (think/search/chain)
 * - Autonomous dream distillation
 *
 * Usage:
 *   OLLAMA_MODEL=qwen2.5:3b VAULT_PATH=~/Vault bun run index.ts
 */

import { resolve, join } from "path";
import { existsSync, mkdirSync } from "fs";
import { VaultWatcher } from "./src/watcher";
import { processTask, infer } from "./src/engine";
import { LiveStream } from "./src/stream";
import { PulseLoop } from "./src/pulse";
import { DreamEngine } from "./src/dreams";
import { SelfAskEngine } from "./src/self_ask";
import { defaultConfig } from "./src/types";
import { syncEmbeddings, embedSingleFile } from "./src/embeddings";
import { TaskMemory } from "./src/memory";
import type { EmbeddingStore } from "./src/embeddings";
import type { TriggerFired } from "./src/triggers";
import type { ChaosSnapshot } from "./src/types";

// ── Global Abort Controller (for graceful shutdown of in-flight inference) ──
export const daemonAbort = new AbortController();

// ── Resolve Vault Path ─────────────────────────────────────
const VAULT_PATH = process.env.VAULT_PATH ?? resolve(
  import.meta.dir, "../../Obsidian_Vault"
);
const INBOX_PATH = join(VAULT_PATH, "GZMO", "Inbox");
const OLLAMA_API_URL = process.env.OLLAMA_URL?.replace("/v1", "") ?? "http://localhost:11434";

// ── Ensure directories exist ───────────────────────────────
for (const dir of [
  join(VAULT_PATH, "GZMO"),
  INBOX_PATH,
  join(VAULT_PATH, "GZMO", "Subtasks"),
  join(VAULT_PATH, "GZMO", "Thought_Cabinet"),
]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ── Boot ───────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════");
console.log("  GZMO Daemon v0.3.0 — Smart Core");
console.log("  ⚡ Chaos Engine + Allostasis + Vault RAG");
console.log("═══════════════════════════════════════════════");
console.log(`  Vault:  ${VAULT_PATH}`);
console.log(`  Inbox:  ${INBOX_PATH}`);
console.log(`  Model:  ${process.env.OLLAMA_MODEL ?? "qwen2.5:3b"}`);
console.log(`  Ollama: ${OLLAMA_API_URL}`);
console.log("═══════════════════════════════════════════════");

// ── Ollama Readiness Gate ──────────────────────────────────────
async function waitForOllama(url: string, maxRetries = 10): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        console.log(`[OLLAMA] Connected (attempt ${i + 1})`);
        return true;
      }
    } catch {}
    const delay = Math.min(1000 * Math.pow(2, i), 15000);
    console.log(`[OLLAMA] Waiting for Ollama... retry ${i + 1}/${maxRetries} (${delay}ms)`);
    await new Promise(r => setTimeout(r, delay));
  }
  return false;
}

// ── Initialize LiveStream ──────────────────────────────────
const stream = new LiveStream(VAULT_PATH);

// ── Initialize PulseLoop (the beating heart) ───────────────
const pulse = new PulseLoop(defaultConfig());
const snapshotPath = join(VAULT_PATH, "GZMO", "CHAOS_STATE.json");
pulse.start(snapshotPath);

// Wire triggers → LiveStream (NEVER to APIs)
pulse.setTriggerDispatch((fired: TriggerFired[], snap: ChaosSnapshot) => {
  for (const f of fired) {
    if (f.action.type === "log") {
      stream.log(f.action.message, {
        tension: snap.tension,
        energy: snap.energy,
        phase: snap.phase,
      });
    }
  }
});

stream.log("🟢 Daemon started. Chaos Engine at 174 BPM.");

// ── Initialize Task Memory ────────────────────────────────
const memoryPath = join(VAULT_PATH, "GZMO", "memory.json");
const memory = new TaskMemory(memoryPath);
console.log(`[MEMORY] Loaded ${memory.count} entries from memory.json`);

// ── Initialize Embeddings (Vault RAG) ──────────────────────
const embeddingsPath = join(VAULT_PATH, "GZMO", "embeddings.json");
let embeddingStore: EmbeddingStore | undefined;

async function bootEmbeddings(): Promise<void> {
  try {
    console.log("[EMBED] Syncing vault embeddings...");
    embeddingStore = await syncEmbeddings(VAULT_PATH, embeddingsPath, OLLAMA_API_URL);
    stream.log(`📚 Vault indexed: ${embeddingStore.chunks.length} chunks embedded.`);
  } catch (err: any) {
    console.warn(`[EMBED] Embedding sync failed (non-fatal): ${err?.message}`);
    console.warn("[EMBED] Vault search will be unavailable until embeddings sync.");
  }
}

// ── Initialize Watcher (declared here, started after Ollama gate) ──
const watcher = new VaultWatcher(INBOX_PATH);

let activeTaskCount = 0;

watcher.on("task", async (event) => {
  activeTaskCount++;
  const action = event.frontmatter?.action ?? "think";
  stream.log(`📥 Task claimed: **${event.fileName}** (${action})`);

  try {
    await processTask(event, watcher, pulse, embeddingStore, memory);
    stream.log(`✅ Task completed: **${event.fileName}**`);
  } catch (err: any) {
    stream.log(`❌ Task failed: **${event.fileName}** — ${err?.message}`);
  }

  activeTaskCount--;
  if (activeTaskCount === 0) {
    stream.log("💤 Idle. Waiting for tasks...");
  }
});

// ── Boot Sequence (Ollama-gated) ──────────────────────────────
(async () => {
  const ollamaReady = await waitForOllama(OLLAMA_API_URL);

  if (!ollamaReady) {
    console.error("[CRITICAL] Ollama unreachable after all retries. Inference, dreams, and self-ask DISABLED.");
    console.error("[CRITICAL] Start Ollama and restart the daemon: sudo systemctl start ollama && systemctl --user restart gzmo-daemon");
    stream.log("🔴 **Ollama unreachable** — inference disabled. Start Ollama and restart daemon.");
    // Don't exit — keep the heartbeat alive so the operator can see LiveStream status
  } else {
    // Boot embeddings only after Ollama is confirmed
    await bootEmbeddings();
  }

  // ── Embedding Live-Sync (wiki watcher) ─────────────────────
  if (embeddingStore) {
    const chokidarMod = await import("chokidar");
    const { watch } = chokidarMod;
    const WATCH_DIRS = [
      join(VAULT_PATH, "wiki"),
      join(VAULT_PATH, "GZMO", "Thought_Cabinet"),
    ];

    const embedWatcher = watch(WATCH_DIRS, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
    });

    let embedDebounce: ReturnType<typeof setTimeout> | null = null;
    const pendingFiles = new Set<string>();

    const processEmbedQueue = async () => {
      if (!embeddingStore) return;
      const files = [...pendingFiles];
      pendingFiles.clear();
      for (const fullPath of files) {
        const relPath = fullPath.replace(VAULT_PATH + "/", "");
        try {
          await embedSingleFile(VAULT_PATH, relPath, embeddingStore!, embeddingsPath, OLLAMA_API_URL);
          console.log(`[EMBED] Live-synced: ${relPath}`);
        } catch {
          // non-fatal
        }
      }
    };

    const onFileEvent = (filePath: string) => {
      if (!filePath.endsWith(".md")) return;
      pendingFiles.add(filePath);
      if (embedDebounce) clearTimeout(embedDebounce);
      embedDebounce = setTimeout(processEmbedQueue, 3000);
    };

    embedWatcher.on("change", onFileEvent);
    embedWatcher.on("add", onFileEvent);

    console.log("[EMBED] Live-sync watcher started on wiki/ + Thought_Cabinet/");
  }

  // ── Start Watcher (only after Ollama gate) ────────────────────
  watcher.start();
})();

// ── Initialize Dream Engine ────────────────────────────────
const dreams = new DreamEngine(VAULT_PATH);

// Dream cycle: every 30 minutes
const DREAM_INTERVAL_MS = 30 * 60 * 1000;
setInterval(async () => {
  const snap = pulse.snapshot();
  if (!snap.alive || snap.energy < 20) return;

  try {
    const result = await dreams.dream(snap, infer, embeddingStore ?? undefined, OLLAMA_API_URL);
    if (result) {
      stream.log(`🌙 Dream crystallized from **${result.taskFile}**`);
      pulse.emitEvent({ type: "dream_proposed", dreamText: result.insights.slice(0, 200) });

      // Re-embed the new dream file
      if (embeddingStore) {
        const { basename } = await import("path");
        const dreamFileName = basename(result.vaultPath);
        const dreamRelPath = `GZMO/Thought_Cabinet/${dreamFileName}`;
        embedSingleFile(VAULT_PATH, dreamRelPath, embeddingStore, embeddingsPath, OLLAMA_API_URL)
          .catch(() => {}); // non-fatal
      }
    }
  } catch (err: any) {
    console.error(`[DREAM] Dream cycle error: ${err?.message}`);
  }
}, DREAM_INTERVAL_MS);

// ── Initialize Self-Ask Engine ─────────────────────────────
const selfAsk = new SelfAskEngine(VAULT_PATH);

// Self-Ask cycle: every 2 hours
const SELFASK_INTERVAL_MS = 2 * 60 * 60 * 1000;
setInterval(async () => {
  const snap = pulse.snapshot();
  if (!snap.alive || !embeddingStore) return;

  try {
    const results = await selfAsk.cycle(snap, embeddingStore, OLLAMA_API_URL, infer);
    for (const result of results) {
      stream.log(`🔍 Self-Ask (${result.strategy}): ${result.output.slice(0, 80).replace(/\n/g, " ")}`);
      pulse.emitEvent({ type: "self_ask_completed", strategy: result.strategy, result: result.output });

      // Re-embed the new self-ask file
      if (result.vaultPath && embeddingStore) {
        const { basename } = await import("path");
        const fileName = basename(result.vaultPath);
        const relPath = `GZMO/Thought_Cabinet/${fileName}`;
        embedSingleFile(VAULT_PATH, relPath, embeddingStore, embeddingsPath, OLLAMA_API_URL)
          .catch(() => {}); // non-fatal
      }
    }
    if (results.length > 0) {
      stream.log(`🔍 Self-Ask cycle complete: ${results.length} strategies ran.`);
    }
  } catch (err: any) {
    console.error(`[SELF-ASK] Cycle error: ${err?.message}`);
  }
}, SELFASK_INTERVAL_MS);
// ── Heartbeat Logger (every 60s) ───────────────────────────
setInterval(() => {
  const snap = pulse.snapshot();
  stream.log("💓 Pulse.", {
    tension: snap.tension,
    energy: snap.energy,
    phase: snap.phase,
  });

  // Feed heartbeat back into chaos engine
  pulse.emitEvent({ type: "heartbeat_fired", energy: snap.energy });
}, 60_000);

// ── Graceful Shutdown ──────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`\n[DAEMON] Received ${signal}. Shutting down...`);
  stream.log(`🔴 Daemon shutting down (${signal}).`);

  // Abort any in-flight LLM inference calls
  daemonAbort.abort();

  stream.destroy(); // Flush buffered log entries
  pulse.stop();
  await watcher.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));