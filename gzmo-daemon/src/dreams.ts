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
import type { EmbeddingStore } from "./embeddings";
import { searchVault, formatSearchContext, type SearchResult } from "./search";

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
    store?: EmbeddingStore,
    ollamaUrl?: string,
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

    // 3. Search vault for related knowledge (RAG grounding)
    let vaultContext = "";
    let relatedFiles: SearchResult[] = [];
    if (store && store.chunks.length > 0) {
      try {
        // Use the first 500 chars of transcript as search query
        const query = transcript.slice(0, 500);
        const results = await searchVault(query, store, ollamaUrl, 5);
        if (results.length > 0) {
          vaultContext = formatSearchContext(results);
          relatedFiles = results;
          console.log(`[DREAM] RAG: found ${results.length} vault chunks (top: ${(results[0]!.score * 100).toFixed(0)}%)`);
        }
      } catch (err: any) {
        console.warn(`[DREAM] RAG search failed (non-fatal): ${err?.message}`);
      }
    }

    // 4. Reflect via local Ollama (with vault context)
    const insights = await this.reflect(transcript, vaultContext, snapshot, infer);
    if (!insights) return null;

    // 5. Write dream entry to Thought Cabinet (with vault links)
    const dreamPath = this.writeDreamEntry(insights, snapshot, task.id, relatedFiles);

    // 6. Mark as digested
    this.markDigested(task.id);

    return {
      taskFile: task.id,
      insights,
      vaultPath: dreamPath,
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
    vaultContext: string,
    snap: ChaosSnapshot,
    infer: (system: string, prompt: string) => Promise<string>,
  ): Promise<string | null> {
    const systemPrompt = [
      "You are summarizing a completed task for a knowledge vault.",
      "You MUST only state facts that appear in the TASK TRANSCRIPT or VAULT CONTEXT below.",
      "Do NOT invent concepts, names, formulas, or discoveries that are not in the text.",
      "If the task was trivial or contained little substance, say so briefly.",
      "",
      "## Instructions",
      "",
      "1. **What was done** — Summarize what the task asked and what the response contained. Quote or closely paraphrase the actual text.",
      "2. **Connections to existing knowledge** — If vault context is provided below, note specific links between this task and existing vault entries. Reference the source file names.",
      "3. **What to remember** — State 1-3 concrete, factual takeaways. These must be verifiable from the text above.",
      "",
      "If there is nothing meaningful to extract, write: 'No significant insights — task was routine.'",
      "",
      "Format: short paragraphs, no headers, no invented terminology. Max 200 words total.",
    ].join("\n");

    const userPrompt = [
      "## TASK TRANSCRIPT",
      "",
      transcript,
    ];

    if (vaultContext) {
      userPrompt.push("", "## VAULT CONTEXT (related existing knowledge)", "", vaultContext);
    }

    userPrompt.push("", "---", "", "Summarize this task and connect it to the vault context above.");

    try {
      const result = await infer(systemPrompt, userPrompt.join("\n"));
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
    relatedFiles: SearchResult[] = [],
  ): string {
    const cabinetDir = path.join(this.vaultPath, "GZMO", "Thought_Cabinet");
    try { fs.mkdirSync(cabinetDir, { recursive: true }); } catch {}

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "-");
    const filename = `${dateStr}_${timeStr}_dream.md`;
    const filepath = path.join(cabinetDir, filename);

    // Build Obsidian wiki-links from RAG search results
    const uniqueFiles = [...new Set(relatedFiles.map(r => r.file))];
    const wikiLinks = uniqueFiles.map(f => {
      const basename = f.replace(/\.md$/, "").split("/").pop() || f;
      return `- [[${basename}]]`;
    });

    // Source task link
    const sourceBasename = taskFile.replace(/\.md$/, "");

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
      `Source: [[${sourceBasename}]]`,
      "",
      "## Crystallized Insights",
      "",
      insights,
      "",
    ];

    // Add vault links section if we have related files
    if (wikiLinks.length > 0) {
      content.push(
        "## Vault Links",
        "",
        ...wikiLinks,
        "",
      );
    }

    content.push(
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
    );

    fs.writeFileSync(filepath, content.join("\n"), "utf-8");
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
