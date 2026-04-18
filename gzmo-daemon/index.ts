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
import { defaultConfig } from "./src/types";
import { syncEmbeddings, embedSingleFile } from "./src/embeddings";
import { TaskMemory } from "./src/memory";
import type { EmbeddingStore } from "./src/embeddings";
import type { TriggerFired } from "./src/triggers";
import type { ChaosSnapshot } from "./src/types";

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

// Boot embeddings async — don't block daemon startup
bootEmbeddings().then(() => {
  // ── Embedding Live-Sync (wiki watcher) ─────────────────────
  // Re-embed files when they change so new notes are searchable immediately
  if (embeddingStore) {
    const { watch } = require("chokidar");
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

    embedWatcher.on("change", (filePath: string) => {
      if (!filePath.endsWith(".md")) return;
      pendingFiles.add(filePath);
      if (embedDebounce) clearTimeout(embedDebounce);
      embedDebounce = setTimeout(processEmbedQueue, 3000);
    });

    embedWatcher.on("add", (filePath: string) => {
      if (!filePath.endsWith(".md")) return;
      pendingFiles.add(filePath);
      if (embedDebounce) clearTimeout(embedDebounce);
      embedDebounce = setTimeout(processEmbedQueue, 3000);
    });

    console.log("[EMBED] Live-sync watcher started on wiki/ + Thought_Cabinet/");
  }
});

// ── Initialize Dream Engine ────────────────────────────────
const dreams = new DreamEngine(VAULT_PATH);

// Dream cycle: every 30 minutes
const DREAM_INTERVAL_MS = 30 * 60 * 1000;
setInterval(async () => {
  const snap = pulse.snapshot();
  if (!snap.alive || snap.energy < 20) return;

  try {
    const result = await dreams.dream(snap, infer);
    if (result) {
      stream.log(`🌙 Dream crystallized from **${result.taskFile}**`);
      pulse.emitEvent({ type: "dream_proposed", dreamText: result.insights.slice(0, 200) });

      // Re-embed the new dream file
      if (embeddingStore) {
        const dreamRelPath = `GZMO/Thought_Cabinet/${result.fileName}`;
        embedSingleFile(VAULT_PATH, dreamRelPath, embeddingStore, embeddingsPath, OLLAMA_API_URL)
          .catch(() => {}); // non-fatal
      }
    }
  } catch (err: any) {
    console.error(`[DREAM] Dream cycle error: ${err?.message}`);
  }
}, DREAM_INTERVAL_MS);

// ── Initialize Watcher ─────────────────────────────────────
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

watcher.start();

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
  pulse.stop();
  await watcher.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));