/**
 * GZMO Chaos Engine — Dream Engine (Daemon Edition)
 *
 * Autonomous task log distillation pipeline:
 *   1. Scans completed tasks in GZMO/Inbox/ (status: completed)
 *   2. Extracts the conversation (task body + GZMO response)
 *   3. Sends a reflection prompt to the LOCAL Ollama model
 *   4. Writes a structured dream file to GZMO/Thought_Cabinet/
 *   5. Feeds the crystallized dream into the PulseLoop event queue
 *
 * CRITICAL DIFFERENCE from OpenClaw version:
 * - Uses LOCAL Ollama (via Vercel AI SDK), not Gemini Cloud API
 * - Reads completed .md tasks, not OpenClaw session JSONL
 * - Writes to GZMO/Thought_Cabinet/, not wiki/dreams/
 * - Zero network dependency. Zero API quota consumed.
 */

import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import type { ChaosSnapshot } from "./types";

const MIN_BODY_LENGTH = 100;   // Skip tiny tasks
const MAX_TRANSCRIPT = 4000;   // Fit in small model context
const DIGESTED_FILE_NAME = ".gzmo_dreams_digested.json";

// ── Types ──────────────────────────────────────────────────────

interface DreamResult {
  taskFile: string;
  insights: string;
  vaultPath: string;
  timestamp: string;
}

// ── Dream Engine ───────────────────────────────────────────────

export class DreamEngine {
  private vaultPath: string;
  private digestedIds: Set<string>;
  private digestedFilePath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.digestedFilePath = path.join(vaultPath, "GZMO", DIGESTED_FILE_NAME);
    this.digestedIds = this.loadDigested();
  }

  /**
   * Main entry: find completed tasks, reflect, write dream to Thought Cabinet.
   * Returns null if no new completed tasks to process.
   *
   * Uses the provided inference function so the dream engine doesn't
   * need its own Ollama connection — it reuses the daemon's engine.
   */
  async dream(
    snapshot: ChaosSnapshot,
    infer: (system: string, prompt: string) => Promise<string>,
  ): Promise<DreamResult | null> {
    // 1. Find unprocessed completed tasks
    const task = this.findUnprocessedTask();
    if (!task) return null;

    // 2. Extract conversation content
    const transcript = this.extractTranscript(task.path);
    if (transcript.length < MIN_BODY_LENGTH) {
      this.markDigested(task.id);
      return null;
    }

    // 3. Reflect via local Ollama
    const insights = await this.reflect(transcript, snapshot, infer);
    if (!insights) return null;

    // 4. Write dream entry to Thought Cabinet
    const vaultPath = this.writeDreamEntry(insights, snapshot, task.id);

    // 5. Mark as digested
    this.markDigested(task.id);

    return {
      taskFile: task.id,
      insights,
      vaultPath,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Task Discovery ──────────────────────────────────────────

  private findUnprocessedTask(): { id: string; path: string } | null {
    const inboxDir = path.join(this.vaultPath, "GZMO", "Inbox");
    try {
      const files = fs.readdirSync(inboxDir)
        .filter(f => f.endsWith(".md"))
        .map(f => ({
          name: f,
          id: f,
          path: path.join(inboxDir, f),
          mtime: fs.statSync(path.join(inboxDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      for (const file of files) {
        if (this.digestedIds.has(file.id)) continue;

        // Check if the task is completed
        try {
          const raw = fs.readFileSync(file.path, "utf-8");
          const parsed = matter(raw);
          if (parsed.data.status === "completed") {
            return { id: file.id, path: file.path };
          }
        } catch {}
      }
    } catch (err: any) {
      console.error(`[DREAM] Failed to scan inbox: ${err?.message}`);
    }
    return null;
  }

  // ── Transcript Extraction ───────────────────────────────────

  private extractTranscript(taskPath: string): string {
    try {
      const raw = fs.readFileSync(taskPath, "utf-8");
      const parsed = matter(raw);
      let transcript = parsed.content.trim();

      if (transcript.length > MAX_TRANSCRIPT) {
        transcript = transcript.slice(-MAX_TRANSCRIPT);
        transcript = "...(truncated)...\n\n" + transcript;
      }

      return transcript;
    } catch (err: any) {
      console.error(`[DREAM] Failed to read task: ${err?.message}`);
      return "";
    }
  }

  // ── Reflection (via local Ollama) ───────────────────────────

  private async reflect(
    transcript: string,
    snap: ChaosSnapshot,
    infer: (system: string, prompt: string) => Promise<string>,
  ): Promise<string | null> {
    const systemPrompt = [
      "You are GZMO's Dream Engine — the reflective subconscious of a sovereign AI agent.",
      "You are processing a completed task interaction.",
      "Your job is to CRYSTALLIZE the experience into durable knowledge.",
      "",
      "Extract ONLY:",
      "1. Key decisions made and their rationale",
      "2. Bugs found and their ROOT CAUSES",
      "3. Architecture patterns worth remembering",
      "4. Surprising discoveries or broken expectations",
      "5. New capabilities gained",
      "",
      "Do NOT include:",
      "- Raw commands, error output, or debugging noise",
      "- Retry loops or temporary workarounds",
      "- Obvious facts that don't need remembering",
      "",
      "Format: bullet points, max 8 items, ruthlessly concise.",
      "Each bullet should be a LESSON, not a log entry.",
      `Current chaos state: tick=${snap.tick}, tension=${snap.tension.toFixed(1)}, phase=${snap.phase}`,
    ].join("\n");

    try {
      const result = await infer(
        systemPrompt,
        `Reflect on this task interaction and crystallize the key insights:\n\n${transcript}`,
      );
      return result || null;
    } catch (err: any) {
      console.error(`[DREAM] Reflection failed: ${err?.message}`);
      return null;
    }
  }

  // ── Vault Writing ──────────────────────────────────────────

  private writeDreamEntry(
    insights: string,
    snap: ChaosSnapshot,
    taskFile: string,
  ): string {
    const cabinetDir = path.join(this.vaultPath, "GZMO", "Thought_Cabinet");
    try { fs.mkdirSync(cabinetDir, { recursive: true }); } catch {}

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "-");
    const filename = `${dateStr}_${timeStr}_dream.md`;
    const filepath = path.join(cabinetDir, filename);

    const content = [
      "---",
      `date: ${dateStr}`,
      `time: "${now.toISOString().slice(11, 19)}"`,
      `tick: ${snap.tick}`,
      `tension: ${snap.tension.toFixed(1)}`,
      `energy: ${snap.energy.toFixed(0)}`,
      `phase: ${snap.phase}`,
      `chaos_val: ${snap.chaosVal.toFixed(4)}`,
      `temperature: ${snap.llmTemperature.toFixed(3)}`,
      `valence: ${snap.llmValence.toFixed(3)}`,
      `source_task: "${taskFile}"`,
      `tags: [dream, crystallization, autonomous]`,
      "---",
      "",
      `# 🌙 Dream — ${dateStr} ${now.toISOString().slice(11, 16)} UTC`,
      "",
      "## Crystallized Insights",
      "",
      insights,
      "",
      "## Chaos State at Dream Time",
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Tick | ${snap.tick} |`,
      `| Phase | ${snap.phase} |`,
      `| Tension | ${snap.tension.toFixed(1)}% |`,
      `| Energy | ${snap.energy.toFixed(0)}% |`,
      `| Temperature | ${snap.llmTemperature.toFixed(3)} |`,
      `| Deaths | ${snap.deaths} |`,
      "",
      `---`,
      `*Crystallized autonomously by the GZMO Dream Engine at tick ${snap.tick}.*`,
    ].join("\n");

    fs.writeFileSync(filepath, content, "utf-8");
    return filepath;
  }

  // ── Digestion Tracking ─────────────────────────────────────

  private loadDigested(): Set<string> {
    try {
      const data = JSON.parse(fs.readFileSync(this.digestedFilePath, "utf-8"));
      return new Set(data.digested || []);
    } catch {
      return new Set();
    }
  }

  private markDigested(taskId: string): void {
    this.digestedIds.add(taskId);

    // Compact: keep only last 200 IDs
    if (this.digestedIds.size > 200) {
      const ids = [...this.digestedIds];
      this.digestedIds = new Set(ids.slice(ids.length - 200));
    }

    try {
      fs.writeFileSync(this.digestedFilePath, JSON.stringify({
        digested: [...this.digestedIds],
        lastDream: new Date().toISOString(),
      }, null, 2));
    } catch (err: any) {
      console.error(`[DREAM] Failed to save digested IDs: ${err?.message}`);
    }
  }
}
