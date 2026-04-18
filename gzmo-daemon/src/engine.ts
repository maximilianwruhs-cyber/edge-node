/**
 * engine.ts — The GZMO inference engine (Smart Core v0.3.0)
 *
 * Now with:
 * - Task routing via `action:` frontmatter
 * - Vault search via nomic-embed-text embeddings
 * - Episodic memory for cross-task continuity
 * - Chaos-aware LLM parameter modulation
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { updateFrontmatter, appendToTask } from "./frontmatter";
import type { TaskEvent } from "./watcher";
import type { VaultWatcher } from "./watcher";
import { resolve } from "path";
import type { ChaosSnapshot } from "./types";
import type { PulseLoop } from "./pulse";
import type { EmbeddingStore } from "./embeddings";
import { searchVault, formatSearchContext } from "./search";
import { TaskMemory } from "./memory";

// ── Configuration ──────────────────────────────────────────
const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";
const OLLAMA_API_URL = process.env.OLLAMA_URL?.replace("/v1", "") ?? "http://localhost:11434";

// ── Provider Setup ─────────────────────────────────────────
const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: OLLAMA_BASE_URL,
});

// ── Task Actions ───────────────────────────────────────────
type TaskAction = "think" | "search" | "chain";

function parseAction(frontmatter: Record<string, unknown>): TaskAction {
  const action = String(frontmatter.action ?? "think").toLowerCase();
  if (action === "search" || action === "chain") return action;
  return "think";
}

// ── System Prompt (lean for GTX 1070 prefill speed) ────────
function buildSystemPrompt(
  snap?: ChaosSnapshot,
  vaultContext?: string,
  memoryContext?: string,
): string {
  let prompt = "You are GZMO, a local AI daemon. Be concise and technical. Respond in Markdown.";

  if (snap) {
    prompt += ` [T:${snap.tension.toFixed(0)} E:${snap.energy.toFixed(0)}% ${snap.phase}]`;
  }

  // Inject vault search context (action: search)
  if (vaultContext) {
    prompt += vaultContext;
  }

  // Inject episodic memory (~100 tokens)
  if (memoryContext) {
    prompt += memoryContext;
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
  let text = "";
  for await (const chunk of result.textStream) {
    text += chunk;
  }
  return text;
}

// ── Task Processor (Smart Core) ────────────────────────────
export async function processTask(
  event: TaskEvent,
  watcher: VaultWatcher,
  pulse?: PulseLoop,
  embeddingStore?: EmbeddingStore,
  memory?: TaskMemory,
): Promise<void> {
  const { filePath, fileName, body, frontmatter } = event;
  const startTime = Date.now();

  // Lock the file so our writes don't re-trigger the watcher
  watcher.lockFile(filePath);

  // Emit task_received event into chaos engine
  pulse?.emitEvent({ type: "task_received", bodyLength: body.length });

  try {
    // 0. Parse action from frontmatter
    const action = parseAction(frontmatter ?? {});
    console.log(`[ENGINE] Processing: ${fileName} (action: ${action})`);

    // 1. Claim the task
    updateFrontmatter(filePath, {
      status: "processing",
      started_at: new Date().toISOString(),
    });

    // 2. Build context based on action
    let vaultContext: string | undefined;
    
    if (action === "search" && embeddingStore) {
      // Vault search: find relevant chunks before answering
      const results = await searchVault(body, embeddingStore, OLLAMA_API_URL, 3);
      if (results.length > 0) {
        vaultContext = formatSearchContext(results);
        console.log(`[ENGINE] Found ${results.length} vault chunks (top: ${(results[0]!.score * 100).toFixed(0)}%)`);

      }
    }

    // 3. Build system prompt with context
    const snap = pulse?.snapshot();
    const memoryContext = memory?.toPromptContext();
    const systemPrompt = buildSystemPrompt(snap, vaultContext, memoryContext);

    // 4. Run inference (chaos-modulated)
    const result = streamText({
      model: ollama(OLLAMA_MODEL),
      system: systemPrompt,
      prompt: body,
      temperature: snap?.llmTemperature ?? 0.7,
    });

    // 5. Stream the response
    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }

    // 6. Append the result to the task file
    const output = `\n---\n\n## GZMO Response\n*${new Date().toISOString()}*\n\n${fullText}`;
    appendToTask(filePath, output);

    // 7. Mark as completed
    updateFrontmatter(filePath, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    console.log(`[ENGINE] Completed: ${fileName} (${action})`);

    // 8. Record in episodic memory
    memory?.record(fileName, fullText);

    // 9. Feed completion back into chaos engine
    const durationMs = Date.now() - startTime;
    pulse?.emitEvent({
      type: "task_completed",
      tokenCount: fullText.length / 4,
      durationMs,
    });

    // 10. Handle chain action — create next task
    if (action === "chain" && frontmatter?.chain_next) {
      const nextTask = String(frontmatter.chain_next);
      console.log(`[ENGINE] Chain → next task: ${nextTask}`);
      const { dirname, join } = await import("path");
      const chainPath = join(dirname(filePath), nextTask);
      const chainContent = `---\nstatus: pending\naction: think\nchain_from: ${fileName}\n---\n\n## Chained Task\n\nPrevious context:\n${fullText.slice(0, 300)}\n\nContinue from here.`;
      
      try {
        const { writeFileSync } = await import("fs");
        writeFileSync(chainPath, chainContent);
      } catch (err) {
        console.warn(`[ENGINE] Chain write failed: ${err}`);
      }
    }

  } catch (err: any) {
    console.error(`[ENGINE] Failed: ${fileName} — ${err?.message}`);

    try {
      appendToTask(filePath, `\n---\n\n## ❌ Error\n\`\`\`\n${err?.message}\n\`\`\``);
      updateFrontmatter(filePath, {
        status: "failed",
        completed_at: new Date().toISOString(),
      });
    } catch { /* last resort */ }

    pulse?.emitEvent({ type: "task_failed", errorType: err?.message ?? "unknown" });

  } finally {
    setTimeout(() => watcher.unlockFile(filePath), 1000);
  }
}
