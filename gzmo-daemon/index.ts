/**
 * GZMO Daemon v0.2.0 — The Obsidian OS (Chaos Edition)
 *
 * A sovereign, filesystem-driven AI daemon with a Lorenz attractor
 * heartbeat, Thought Cabinet crystallization, and autonomous dream
 * distillation. No chat apps. No cloud APIs for background ops.
 * Just you, your vault, and the daemon.
 *
 * Architecture:
 *   PulseLoop (174 BPM)  →  Lorenz + Logistic + ThoughtCabinet
 *                         →  Triggers → LiveStream.md (file writes)
 *   VaultWatcher          →  Inbox tasks → Ollama inference → task files
 *   DreamEngine           →  Completed tasks → reflection → Thought_Cabinet/
 *
 * Usage:
 *   bun run index.ts
 *
 * Environment:
 *   VAULT_PATH    — Path to Obsidian Vault
 *   OLLAMA_URL    — Ollama API base URL (default: http://localhost:11434/v1)
 *   OLLAMA_MODEL  — Model to use (default: qwen2.5:3b)
 */

import { resolve, join } from "path";
import { existsSync, mkdirSync } from "fs";
import { VaultWatcher } from "./src/watcher";
import { processTask, infer } from "./src/engine";
import { LiveStream } from "./src/stream";
import { PulseLoop } from "./src/pulse";
import { DreamEngine } from "./src/dreams";
import { defaultConfig } from "./src/types";
import type { TriggerFired, TriggerAction } from "./src/triggers";
import type { ChaosSnapshot } from "./src/types";

// ── Resolve Vault Path ─────────────────────────────────────
const VAULT_PATH = process.env.VAULT_PATH ?? resolve(
  import.meta.dir, "../../Obsidian_Vault"
);
const INBOX_PATH = join(VAULT_PATH, "GZMO", "Inbox");

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
console.log("  GZMO Daemon v0.2.0 — The Obsidian OS");
console.log("  ⚡ Chaos Engine Active");
console.log("═══════════════════════════════════════════════");
console.log(`  Vault:  ${VAULT_PATH}`);
console.log(`  Inbox:  ${INBOX_PATH}`);
console.log(`  Model:  ${process.env.OLLAMA_MODEL ?? "qwen2.5:3b"}`);
console.log(`  Ollama: ${process.env.OLLAMA_URL ?? "http://localhost:11434/v1"}`);
console.log("═══════════════════════════════════════════════");

// ── Initialize LiveStream ──────────────────────────────────
const stream = new LiveStream(VAULT_PATH);

// ── Initialize PulseLoop (the beating heart) ───────────────
const pulse = new PulseLoop(defaultConfig());
const snapshotPath = join(VAULT_PATH, "GZMO", "CHAOS_STATE.json");
pulse.start(snapshotPath);

// Wire triggers → LiveStream (NEVER to APIs — lesson from old build)
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

// ── Initialize Dream Engine ────────────────────────────────
const dreams = new DreamEngine(VAULT_PATH);

// Dream cycle: every 30 minutes, check for completed tasks to reflect on
const DREAM_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
setInterval(async () => {
  const snap = pulse.snapshot();
  // Only dream if there's enough energy and the engine is alive
  if (!snap.alive || snap.energy < 20) return;

  try {
    const result = await dreams.dream(snap, infer);
    if (result) {
      stream.log(`🌙 Dream crystallized from **${result.taskFile}**`);
      pulse.emitEvent({ type: "dream_proposed", dreamText: result.insights.slice(0, 200) });
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
  stream.log(`📥 Task claimed: **${event.fileName}**`);

  try {
    await processTask(event, watcher, pulse);
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

// ── Heartbeat Logger (every 60s: real chaos state) ─────────
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