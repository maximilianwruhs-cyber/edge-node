/**
 * GZMO Chaos Engine — Dream Engine
 *
 * Autonomous session log distillation pipeline:
 *   1. Reads the latest OpenClaw session JSONL
 *   2. Extracts user/assistant conversation text (filters noise)
 *   3. Sends a reflection prompt to Gemini for crystallization
 *   4. Writes the output as a structured Obsidian Vault entry
 *   5. Feeds the crystallized dream into the Thought Cabinet
 *
 * Triggered by autonomous_pulse (every 520 ticks / ~3 min).
 * Only processes NEW sessions — tracks digested session IDs.
 */

import * as fs from "fs";
import * as path from "path";
import type { ChaosSnapshot } from "./types";

const MIN_MESSAGES = 5;     // Skip tiny test sessions
const MAX_TRANSCRIPT = 6000; // Truncate long sessions to fit context
const DIGESTED_FILE = "/workspace/CHAOS_DREAMS_DIGESTED.json";

// ── Types ──────────────────────────────────────────────────────

interface SessionMessage {
  role: "user" | "assistant" | "toolResult";
  text: string;
}

interface DreamResult {
  sessionId: string;
  insights: string;
  vaultPath: string;
  timestamp: string;
}

// ── Dream Engine ───────────────────────────────────────────────

export class DreamEngine {
  private digestedIds: Set<string>;
  private apiKey: string;

  constructor() {
    this.digestedIds = this.loadDigested();
    this.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  }

  /**
   * Main entry: find the latest unprocessed session, reflect, write to vault.
   * Returns null if no new session to process.
   */
  async dream(
    sessionDir: string,
    vaultDir: string,
    snapshot: ChaosSnapshot,
  ): Promise<DreamResult | null> {
    // 1. Find latest unprocessed session
    const session = this.findLatestUnprocessed(sessionDir);
    if (!session) return null;

    // 2. Extract conversation
    const messages = this.extractMessages(session.path);
    if (messages.length < MIN_MESSAGES) {
      // Too short — mark as digested but don't dream
      this.markDigested(session.id);
      return null;
    }

    // 3. Build transcript
    const transcript = this.buildTranscript(messages);

    // 4. Reflect via Gemini
    const insights = await this.reflect(transcript, snapshot);
    if (!insights) {
      // API failure — don't mark as digested, retry next cycle
      return null;
    }

    // 5. Write vault entry
    const vaultPath = this.writeVaultEntry(vaultDir, insights, snapshot, session.id);

    // 6. Mark as digested
    this.markDigested(session.id);

    // 7. Log
    try {
      fs.appendFileSync("/workspace/CHAOS_TRIGGERS.log",
        `[${new Date().toISOString()}] tick=${snapshot.tick} DREAM: session ${session.id.slice(0, 8)} → ${path.basename(vaultPath)}\n`);
    } catch (err: any) {
      console.error(`[CHAOS] Trigger log write failed (dream): ${err?.message}`);
    }

    return {
      sessionId: session.id,
      insights,
      vaultPath,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Session Discovery ──────────────────────────────────────

  private findLatestUnprocessed(sessionDir: string): { id: string; path: string } | null {
    try {
      const files = fs.readdirSync(sessionDir)
        .filter(f => f.endsWith(".jsonl") && !f.includes(".reset."))
        .map(f => ({
          name: f,
          id: f.replace(".jsonl", ""),
          path: path.join(sessionDir, f),
          mtime: fs.statSync(path.join(sessionDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime); // newest first

      for (const file of files) {
        if (!this.digestedIds.has(file.id)) {
          return { id: file.id, path: file.path };
        }
      }
    } catch (err: any) {
      console.error(`[CHAOS] Failed to read session dir: ${err?.message}`);
    }
    return null;
  }

  // ── Message Extraction ─────────────────────────────────────

  private extractMessages(sessionPath: string): SessionMessage[] {
    const messages: SessionMessage[] = [];
    try {
      const lines = fs.readFileSync(sessionPath, "utf-8").split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type !== "message" || !entry.message) continue;

          const msg = entry.message;
          if (msg.role !== "user" && msg.role !== "assistant") continue;

          // Extract text content, skip tool calls
          const textParts = (msg.content || [])
            .filter((c: any) => c.type === "text" && c.text)
            .map((c: any) => c.text);

          if (textParts.length === 0) continue;

          let text = textParts.join("\n");

          // Strip sender metadata noise from user messages
          if (msg.role === "user") {
            text = text.replace(/Sender \(untrusted metadata\):[\s\S]*?```\n/g, "").trim();
          }

          if (text.length > 10) {  // Skip tiny fragments
            messages.push({ role: msg.role, text });
          }
        } catch (err: any) {
          // Malformed JSON line — skip
        }
      }
    } catch (err: any) {
      console.error(`[CHAOS] Failed to read session ${sessionPath}: ${err?.message}`);
    }
    return messages;
  }

  // ── Transcript Building ────────────────────────────────────

  private buildTranscript(messages: SessionMessage[]): string {
    let transcript = "";
    for (const msg of messages) {
      const prefix = msg.role === "user" ? "USER" : "GZMO";
      transcript += `${prefix}: ${msg.text}\n\n`;
    }

    // Truncate if too long
    if (transcript.length > MAX_TRANSCRIPT) {
      transcript = transcript.slice(-MAX_TRANSCRIPT);
      transcript = "...(truncated)...\n\n" + transcript;
    }

    return transcript;
  }

  // ── Gemini Reflection ──────────────────────────────────────

  private async reflect(transcript: string, snap: ChaosSnapshot): Promise<string | null> {
    if (!this.apiKey) return null;

    const systemPrompt = [
      "You are GZMO's Dream Engine — the reflective subconscious of a sovereign AI agent.",
      "You are processing a conversation that just happened between GZMO and its operator.",
      "Your job is to CRYSTALLIZE the experience into durable knowledge.",
      "",
      "Extract ONLY:",
      "1. Key decisions made and their rationale",
      "2. Bugs found and their ROOT CAUSES (not symptoms or error messages)",
      "3. Architecture patterns worth remembering for future sessions",
      "4. Surprising discoveries or broken expectations",
      "5. New capabilities gained or tools learned",
      "",
      "Do NOT include:",
      "- Raw commands, error output, or debugging noise",
      "- Retry loops or temporary workarounds",
      "- Obvious facts that don't need remembering",
      "",
      "Format: bullet points, max 10 items, ruthlessly concise.",
      "Each bullet should be a LESSON, not a log entry.",
      `Current chaos state: tick=${snap.tick}, tension=${snap.tension.toFixed(1)}, phase=${snap.phase}, energy=${snap.energy.toFixed(0)}%`,
    ].join("\n");

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;

      const body = JSON.stringify({
        contents: [{
          parts: [{ text: `Reflect on this conversation and crystallize the key insights:\n\n${transcript}` }],
        }],
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          temperature: 0.3,  // Low temp for precise reflection
          maxOutputTokens: 1024,
        },
      });

      // Use Node's built-in fetch (Node 18+) or fallback to https
      const response = await this.httpPost(url, body);
      if (!response) return null;

      const data = JSON.parse(response);
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text || null;
    } catch (err: any) {
      console.error(`[CHAOS] Dream reflect() failed: ${err?.message}`);
      return null;
    }
  }

  private httpPost(url: string, body: string): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const https = require("https");
        const urlObj = new URL(url);

        const req = https.request({
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 30000,
        }, (res: any) => {
          let data = "";
          res.on("data", (chunk: string) => { data += chunk; });
          res.on("end", () => resolve(data));
        });

        req.on("error", () => resolve(null));
        req.on("timeout", () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
      } catch (err: any) {
        console.error(`[CHAOS] Dream httpPost() failed: ${err?.message}`);
        resolve(null);
      }
    });
  }

  // ── Vault Writing ──────────────────────────────────────────

  private writeVaultEntry(
    vaultDir: string,
    insights: string,
    snap: ChaosSnapshot,
    sessionId: string,
  ): string {
    // Ensure dreams directory exists
    const dreamsDir = path.join(vaultDir, "wiki", "dreams");
    try { fs.mkdirSync(dreamsDir, { recursive: true }); } catch (err: any) {
      console.error(`[CHAOS] Failed to create dreams dir: ${err?.message}`);
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "-");
    const filename = `${dateStr}_${timeStr}_dream.md`;
    const filepath = path.join(dreamsDir, filename);

    const frontmatter = [
      "---",
      `date: ${dateStr}`,
      `time: "${now.toISOString().slice(11, 19)}"`,
      `tick: ${snap.tick}`,
      `tension: ${snap.tension.toFixed(1)}`,
      `energy: ${snap.energy.toFixed(0)}`,
      `phase: ${snap.phase}`,
      `chaos_val: ${snap.chaosVal.toFixed(4)}`,
      `lorenz_x: ${snap.x.toFixed(3)}`,
      `lorenz_y: ${snap.y.toFixed(3)}`,
      `lorenz_z: ${snap.z.toFixed(3)}`,
      `temperature: ${snap.llmTemperature.toFixed(3)}`,
      `valence: ${snap.llmValence.toFixed(3)}`,
      `session_id: "${sessionId}"`,
      `tags: [dream, crystallization, chaos-engine, autonomous]`,
      "---",
    ].join("\n");

    const content = [
      frontmatter,
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
      `| Valence | ${snap.llmValence.toFixed(3)} |`,
      `| Temperature | ${snap.llmTemperature.toFixed(3)} |`,
      `| Deaths | ${snap.deaths} |`,
      "",
      "## Mutation Applied",
      "",
      "- **dream** → `lorenz_rho +0.8` *(Dream consolidation profoundly reshapes attractor topology)*",
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
      const data = JSON.parse(fs.readFileSync(DIGESTED_FILE, "utf-8"));
      return new Set(data.digested || []);
    } catch {
      return new Set();
    }
  }

  private markDigested(sessionId: string): void {
    this.digestedIds.add(sessionId);

    // Compact: keep only last 200 IDs to prevent unbounded growth
    if (this.digestedIds.size > 200) {
      const ids = [...this.digestedIds];
      this.digestedIds = new Set(ids.slice(ids.length - 200));
    }

    try {
      fs.writeFileSync(DIGESTED_FILE, JSON.stringify({
        digested: [...this.digestedIds],
        lastDream: new Date().toISOString(),
      }, null, 2));
    } catch (err: any) {
      console.error(`[CHAOS] Failed to save digested IDs: ${err?.message}`);
    }
  }
}
