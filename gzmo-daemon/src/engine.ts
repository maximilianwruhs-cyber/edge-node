/**
 * engine.ts — The GZMO inference engine (Chaos-Aware Edition).
 *
 * Connects to the local Ollama instance via the Vercel AI SDK.
 * Now chaos-aware: uses the PulseLoop snapshot to modulate
 * LLM temperature, max tokens, and valence on every inference call.
 *
 * Emits ChaosEvents back into the PulseLoop for the autopoietic loop.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, generateText } from "ai";
import { updateFrontmatter, appendToTask } from "./frontmatter";
import type { TaskEvent } from "./watcher";
import type { VaultWatcher } from "./watcher";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { SkillsDiscovery } from "./skills";
import type { ChaosSnapshot } from "./types";
import type { PulseLoop } from "./pulse";

// ── Configuration ──────────────────────────────────────────
const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";
const VAULT_PATH = process.env.VAULT_PATH ?? resolve(
  import.meta.dir, "../../../Obsidian_Vault"
);

// ── Provider Setup ─────────────────────────────────────────
const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: OLLAMA_BASE_URL,
});

// ── System Prompt (lean for GTX 1070 prefill speed) ────────
function buildSystemPrompt(snap?: ChaosSnapshot): string {
  // Keep system prompt SHORT — the GTX 1070 can't handle heavy prefill.
  // SOUL.md and skills are available for dream reflections, not per-task.
  let prompt = "You are GZMO, a local AI daemon. Be concise and technical. Respond in Markdown.";

  if (snap) {
    prompt += ` [T:${snap.tension.toFixed(0)} E:${snap.energy.toFixed(0)}% ${snap.phase}]`;
  }

  return prompt;
}

// ── Standalone Inference (for DreamEngine) ──────────────────
export async function infer(system: string, prompt: string): Promise<string> {
  const result = streamText({
    model: ollama(OLLAMA_MODEL),
    system,
    prompt,
  });
  // Collect streamed chunks — no timeout, each chunk keeps it alive
  let text = "";
  for await (const chunk of result.textStream) {
    text += chunk;
  }
  return text;
}

// ── Task Processor (Chaos-Aware) ───────────────────────────
export async function processTask(
  event: TaskEvent,
  watcher: VaultWatcher,
  pulse?: PulseLoop,
): Promise<void> {
  const { filePath, fileName, body } = event;
  const startTime = Date.now();

  // Lock the file so our writes don't re-trigger the watcher
  watcher.lockFile(filePath);

  // Emit task_received event into chaos engine
  pulse?.emitEvent({ type: "task_received", bodyLength: body.length });

  try {
    // 1. Claim the task
    console.log(`[ENGINE] Processing: ${fileName}`);
    updateFrontmatter(filePath, {
      status: "processing",
      started_at: new Date().toISOString(),
    });

    // 2. Run inference (chaos-modulated)
    const snap = pulse?.snapshot();
    const systemPrompt = buildSystemPrompt(snap);

    const result = streamText({
      model: ollama(OLLAMA_MODEL),
      system: systemPrompt,
      prompt: body,
      temperature: snap?.llmTemperature ?? 0.7,
    });

    // 3. Stream the response — collect all chunks
    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }

    // 4. Append the result to the task file
    const output = `\n---\n\n## GZMO Response\n*${new Date().toISOString()}*\n\n${fullText}`;
    appendToTask(filePath, output);

    // 5. Mark as completed
    updateFrontmatter(filePath, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    console.log(`[ENGINE] Completed: ${fileName}`);

    // 5. Feed completion back into chaos engine
    const durationMs = Date.now() - startTime;
    pulse?.emitEvent({
      type: "task_completed",
      tokenCount: fullText.length / 4, // rough estimate
      durationMs,
    });

  } catch (err: any) {
    console.error(`[ENGINE] Failed: ${fileName} — ${err?.message}`);

    try {
      appendToTask(filePath, `\n---\n\n## ❌ Error\n\`\`\`\n${err?.message}\n\`\`\``);
      updateFrontmatter(filePath, {
        status: "failed",
        completed_at: new Date().toISOString(),
      });
    } catch { /* last resort */ }

    // Feed failure back into chaos engine
    pulse?.emitEvent({ type: "task_failed", errorType: err?.message ?? "unknown" });

  } finally {
    setTimeout(() => watcher.unlockFile(filePath), 1000);
  }
}
