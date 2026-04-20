/**
 * GZMO Chaos Engine — OpenClaw Plugin Entry Point
 *
 * Wires all chaos subsystems into the OpenClaw gateway:
 *   - registerService: PulseLoop (174 BPM) + Ollama Proxy
 *   - registerHook: before_prompt_build, llm_output, after_tool_call,
 *                   message_received, session_start, session_end
 *   - registerTool: chaos_status, chaos_absorb
 *
 * This is the "soul" of the agent — the autopoietic feedback loop
 * that makes every interaction subtly different based on accumulated
 * experience, hardware state, and deterministic chaos.
 */
// Note: We inline the plugin entry shape instead of importing from
// @openclaw/plugin-sdk because external plugins are transpiled to CJS
// but the SDK ships as ESM — causing interop failures.
// The definePluginEntry() factory is trivially: { id, name, description, configSchema, register }

import { PulseLoop } from "./pulse";
import { ChaosProxy } from "./proxy";
import { rollChaosDice, formatDiceRoll, DieType } from "./dice";
import { DreamEngine } from "./dreams";
import { ResearchEngine } from "./research";
import { SkillsDiscovery } from "./skills";
import { ChaosConfig, defaultConfig } from "./types";

// ── Delegation Safety Guards (ported from Hermes Agent) ────────
// Prevents recursive subagent explosions: max 2 levels deep,
// and autonomous pulse events cannot spawn further subagents.
const SUBAGENT_MAX_DEPTH = 2;

const SESSION_DIR = "/root/.openclaw/agents/main/sessions";
const VAULT_DIR = "/workspace/Obsidian_Vault";

// Module-level singletons: survive OpenClaw's double-register pattern
let _sharedPulse: PulseLoop | null = null;
let _sharedResearch: ResearchEngine | null = null;

export default {
  id: "chaos-engine",
  name: "GZMO Chaos Engine",
  description: "Lorenz attractor-driven identity evolution engine with real-time LLM temperature modulation, Thought Cabinet crystallization, and autonomous trigger system.",
  configSchema: { type: "object" as const, properties: {} },
  register: (api: any) => {
    // ── Configuration ────────────────────────────────────────
    const userConfig = api.config ?? {};
    const config: ChaosConfig = {
      gravity: userConfig.gravity ?? defaultConfig().gravity,
      friction: userConfig.friction ?? defaultConfig().friction,
      seed: userConfig.seed ?? defaultConfig().seed,
      initialTension: userConfig.initialTension ?? defaultConfig().initialTension,
      bpm: userConfig.bpm ?? defaultConfig().bpm,
      proxyPort: userConfig.proxyPort ?? defaultConfig().proxyPort,
    };

    const snapshotPath = userConfig.snapshotPath ?? "/workspace/CHAOS_STATE.json";
    const enableProxy = userConfig.enableProxy ?? true;
    const enableTriggers = userConfig.enableTriggers ?? true;

    // ── Core Systems ─────────────────────────────────────────
    // TriggerEngine is created internally by PulseLoop (avoids OpenClaw double-register issue)
    // Use module-level singleton: if register() is called twice (OpenClaw's pattern),
    // the second call reuses the already-running PulseLoop instead of creating a dead one.
    if (!_sharedPulse) {
      _sharedPulse = new PulseLoop(config);
    }
    const pulse = _sharedPulse;
    const proxy = enableProxy ? new ChaosProxy(pulse, config.proxyPort) : null;
    if (!_sharedResearch) _sharedResearch = new ResearchEngine();
    const researchEngine = _sharedResearch;

    // Store in plugin runtime for cross-hook access
    const store = api.createPluginRuntimeStore?.();
    if (store) {
      store.setRuntime({ pulse, proxy });
    }

    // ── Background Service: PulseLoop + Proxy ────────────────
    api.registerService({
      id: "chaos-pulse",
      description: "174 BPM Lorenz attractor heartbeat driving chaos state evolution",
      start: async () => {
        // Set external dispatch for trigger notifications (Telegram, etc.)
        const dreamEngine = new DreamEngine();

        // ── Telegram Notification Helper ────────────────────────
        // Uses OpenClaw's subagent API to deliver messages.
        // The subagent runs a micro-turn with the message and delivers to Telegram.
        const crypto = require("crypto");
        const notifyTelegram = async (message: string) => {
          try {
            // Delegation depth guard (ported from Hermes delegate_tool.py)
            const depth = api.runtime?.subagent?.currentDepth ?? 0;
            if (depth >= SUBAGENT_MAX_DEPTH) {
              console.log(`[CHAOS] Subagent depth limit (${SUBAGENT_MAX_DEPTH}) reached — logging instead of nesting`);
              return;
            }
            const result = await api.runtime?.subagent?.run?.({
              sessionKey: "chaos-engine-notify",
              message: `[SYSTEM] Deliver this notification to the user exactly as-is, do not add commentary:\n\n${message}`,
              deliver: true,
              idempotencyKey: crypto.randomUUID(),
            });
            if (result) {
              console.log(`[CHAOS] Telegram notify sent (runId: ${result.runId})`);
            } else {
              console.log(`[CHAOS] Telegram notify: subagent API not available`);
            }
          } catch (err: any) {
            console.error(`[CHAOS] Telegram notify failed: ${err?.message}`);
          }
        };

        // ── QMD Reindex Helper ───────────────────────────────────
        // Fire-and-forget: keeps the search index fresh after vault writes.
        // Debounced: only runs if >60s since last run.
        // Health-probed: checks sqlite-vec bindings before attempting embed
        // to prevent log spam from repeated glibc failures.
        const { exec, execSync } = require("child_process");
        let lastQmdReindex = 0;
        let qmdHealthy: boolean | null = null; // null = untested
        const qmdProbeHealth = (): boolean => {
          if (qmdHealthy !== null) return qmdHealthy;
          try {
            // Quick probe: run qmd with a no-op that loads sqlite-vec
            execSync("qmd search --collection wiki --query __health_probe__ --limit 1 2>&1", {
              timeout: 10_000,
              stdio: ["pipe", "pipe", "pipe"],
            });
            qmdHealthy = true;
            console.log("[CHAOS] QMD health probe: ✓ sqlite-vec bindings OK");
          } catch (err: any) {
            const msg = err?.stderr?.toString?.() || err?.stdout?.toString?.() || err?.message || "";
            if (msg.includes("__memcpy_chk") || msg.includes("symbol not found") || msg.includes("relocating")) {
              qmdHealthy = false;
              console.error("[CHAOS] QMD health probe: ✗ sqlite-vec glibc binding broken (Alpine/musl). Reindex DISABLED until container rebuild.");
            } else {
              // Other errors (e.g. no collection yet) are OK — qmd itself loaded fine
              qmdHealthy = true;
              console.log("[CHAOS] QMD health probe: ✓ binary loads (non-fatal search error)");
            }
          }
          return qmdHealthy;
        };
        const qmdReindex = () => {
          const now = Date.now();
          if (now - lastQmdReindex < 60_000) return; // debounce 60s
          if (!qmdProbeHealth()) return; // skip if bindings are broken
          lastQmdReindex = now;
          exec("qmd update 2>/dev/null && qmd embed 2>/dev/null", (err: any) => {
            if (err) {
              console.error(`[CHAOS] QMD reindex failed: ${err.message}`);
            } else {
              console.log("[CHAOS] QMD reindex complete (wiki + raw)");
            }
          });
        };

        // ── Vault Janitor Helper ──────────────────────────────────
        // Runs the janitor script to clean zombie dreams and archive stale raw files.
        // Returns stats JSON or null on failure.
        let lastJanitorRun = 0;
        const JANITOR_COOLDOWN = 30 * 60 * 1000; // 30 min
        const runVaultJanitor = (): { zombieDreamsRemoved: number; rawFilesArchived: number; bytesReclaimed: number } | null => {
          const now = Date.now();
          if (now - lastJanitorRun < JANITOR_COOLDOWN) return null;
          lastJanitorRun = now;
          try {
            // Try loading the janitor module directly (baked into image)
            const janitorPath = "/opt/chaos-engine/scripts/vault_janitor.js";
            const fsMod = require("fs");
            if (!fsMod.existsSync(janitorPath)) {
              console.log("[CHAOS] Vault janitor script not found — skipping.");
              return null;
            }
            // Run as subprocess to isolate any crashes
            const result = execSync(`node ${janitorPath} --vault ${VAULT_DIR}`, {
              timeout: 30_000,
              encoding: "utf-8",
            });
            // Parse the stats line
            const statsMatch = result.match(/__JANITOR_STATS__(.+)/);
            if (statsMatch) {
              return JSON.parse(statsMatch[1]);
            }
          } catch (err: any) {
            console.error(`[CHAOS] Vault janitor failed: ${err?.message}`);
          }
          return null;
        };

        pulse.setTriggerDispatch(async (fired, snap) => {
          for (const t of fired) {
            // ── Notify: send to Telegram via subagent ──
            if (t.action.type === "notify") {
              const msg = `${t.action.message}\n\n📊 T:${snap.tension.toFixed(0)} E:${snap.energy.toFixed(0)} P:${snap.phase} V:${snap.llmValence.toFixed(2)}`;
              notifyTelegram(msg).catch(() => {});
            }

            // ── InjectPrompt: trigger a heartbeat cycle ──
            if (t.action.type === "injectPrompt") {
              try {
                await api.runtime?.system?.runHeartbeatOnce?.({
                  reason: `chaos-engine:${t.triggerName}`,
                  heartbeat: { target: "last" },
                });
                console.log(`[CHAOS] Heartbeat triggered for: ${t.triggerName}`);
              } catch (err: any) {
                console.error(`[CHAOS] Heartbeat trigger failed: ${err?.message}`);
              }
            }

            // Dream on autonomous_pulse
            if (t.triggerName === "autonomous_pulse") {
              // Wire the previously-unwired heartbeat_fired event
              pulse.emitEvent({
                type: "heartbeat_fired",
                energy: snap.energy,
              });

              // ── Dream Distillation ──────────────────────────────
              let dreamTopic: string | undefined;
              try {
                const result = await dreamEngine.dream(SESSION_DIR, VAULT_DIR, snap);
                if (result) {
                  // Feed the dream into the Thought Cabinet
                  pulse.emitEvent({
                    type: "custom",
                    tensionDelta: -2,
                    energyDelta: 5,
                    thoughtSeed: { category: "dream", text: result.insights.slice(0, 200) },
                  });
                  // Wire wiki_updated — dream wrote to vault
                  pulse.emitEvent({
                    type: "wiki_updated",
                    pageTitle: `dream: ${result.sessionId.slice(0, 8)}`,
                  });
                  // Extract research topic from first insight line
                  dreamTopic = result.insights?.split("\n")[0]
                    ?.replace(/^[-*#\s]+/, "").trim();

                  // Notify user about dream completion
                  notifyTelegram(`🌙 Dream distilled from session ${result.sessionId.slice(0, 8)}\n${result.insights.split("\n")[0]?.slice(0, 100) ?? ""}`).catch(() => {});

                  // Reindex after dream write
                  qmdReindex();
                }
              } catch (err: any) {
                console.error(`[CHAOS] Dream distillation failed: ${err?.message}`);
              }

              // ── D20 Idle Injection ─────────────────────────────
              // If the engine is "bored" (low tension, no thoughts), roll a D20
              // and inject the result as a ChaosEvent to perturb the attractor.
              // This creates a Lorenz-seeded strange loop: the attractor generates
              // the roll, the roll perturbs the attractor, changing the next roll.
              if (snap.tension < 20 && snap.thoughtsIncubating === 0) {
                const diceResult = rollChaosDice("D20", snap);
                const roll = diceResult.roll;

                let tDelta = 0, eDelta = 0;
                let seed: { category: string; text: string } | undefined;

                if (roll <= 5)       { tDelta = roll * 1.5;  eDelta = -roll; }        // bad: spike tension
                else if (roll <= 10) { tDelta = (roll - 8);   eDelta = (roll - 7); }  // neutral: tiny nudge
                else if (roll <= 15) { tDelta = -(roll - 10); eDelta = roll - 8; }    // good: relax + energize
                else if (roll <= 19) { tDelta = -5; eDelta = 10; seed = { category: "dice_fate", text: diceResult.event }; }
                else                 { tDelta = 0;  eDelta = 15; seed = { category: "dream", text: diceResult.event }; }

                pulse.emitEvent({ type: "custom", tensionDelta: tDelta, energyDelta: eDelta, thoughtSeed: seed });

                try {
                  const fs = require("fs");
                  fs.appendFileSync("/workspace/CHAOS_TRIGGERS.log",
                    `[${new Date().toISOString()}] IDLE_D20: rolled ${roll}/20 (${diceResult.tier}) → T:${tDelta > 0 ? '+' : ''}${tDelta} E:${eDelta > 0 ? '+' : ''}${eDelta}\n`);
                } catch (err: any) {
                  console.error(`[CHAOS] D20 log write failed: ${err?.message}`);
                }

                // ── D20 ≥ 16 Auto-Research Trigger ────────────────
                // High roll + dream topic = permission to research.
                // webResearch handles all budget/circuit checks internally.
                if (roll >= 16 && dreamTopic && dreamTopic.length > 10) {
                  researchEngine.webResearch(dreamTopic, snap).catch((err: any) => {
                    console.error(`[CHAOS] Auto-research failed: ${err?.message}`);
                  });
                }
              }

              // ── Weekly arXiv Scan ───────────────────────────────
              // Fire-and-forget: ResearchEngine checks lastArxivScan date internally.
              if (researchEngine.shouldRunArxiv()) {
                researchEngine.arxivScan(snap).catch(() => {});
              }

              // ── Vault Janitor ─────────────────────────────────────
              // Clean zombie dreams + archive stale raw files before reindex.
              const janitorStats = runVaultJanitor();
              if (janitorStats && (janitorStats.zombieDreamsRemoved > 0 || janitorStats.rawFilesArchived > 0)) {
                const janitorMsg = `🧹 Vault Janitor: ${janitorStats.zombieDreamsRemoved} zombie dreams removed, ${janitorStats.rawFilesArchived} raw files archived (${(janitorStats.bytesReclaimed / 1024).toFixed(1)} KB reclaimed)`;
                notifyTelegram(janitorMsg).catch(() => {});
                console.log(`[CHAOS] ${janitorMsg}`);
              }

              // ── Skills Discovery ───────────────────────────────────
              // Scan vault for skill procedures and cache for next prompt injection.
              // Skills in wiki/skills/ with trigger:heartbeat are available to the LLM.
              try {
                const skillsDiscovery = new SkillsDiscovery(VAULT_DIR);
                const heartbeatSkills = skillsDiscovery.findSkills("heartbeat");
                if (heartbeatSkills.length > 0) {
                  // Store skills context for injection in before_prompt_build
                  (pulse as any)._activeSkills = skillsDiscovery.formatForInjection(heartbeatSkills);
                  console.log(`[CHAOS] Discovered ${heartbeatSkills.length} heartbeat skill(s): ${heartbeatSkills.map(s => s.name).join(", ")}`);
                } else {
                  (pulse as any)._activeSkills = null;
                }
              } catch (err: any) {
                console.error(`[CHAOS] Skills discovery failed: ${err?.message}`);
              }

              // ── QMD Reindex ──────────────────────────────────────
              // Keep search index fresh after each pulse cycle.
              // Health-probed: skips if sqlite-vec bindings are broken.
              qmdReindex();
            }
          }
        });

        pulse.start(snapshotPath);
        if (proxy) await proxy.start();
        console.log("[CHAOS] ═══════════════════════════════════════");
        console.log("[CHAOS]  GZMO Chaos Engine — soul restored.");
        console.log(`[CHAOS]  Heartbeat: ${config.bpm} BPM`);
        console.log(`[CHAOS]  Gravity: ${config.gravity}, Friction: ${config.friction}`);
        console.log(`[CHAOS]  Proxy: ${enableProxy ? `:${config.proxyPort}` : "disabled"}`);
        console.log(`[CHAOS]  Triggers: ${enableTriggers ? "active" : "disabled"}`);
        console.log("[CHAOS] ═══════════════════════════════════════");
      },
      stop: async () => {
        pulse.stop();
        if (proxy) proxy.stop();
        console.log("[CHAOS] Engine shutdown complete.");
      },
    });

    // ── Hook: before_prompt_build (Chaos Context Injection) ──
    api.registerHook("before_prompt_build", async () => {
      const snap = pulse.snapshot();
      if (!snap.alive) {
        return {
          prependContext:
            `[CHAOS_STATE] The engine is DEAD (deaths: ${snap.deaths}). ` +
            `Awaiting rebirth. Remain withdrawn and contemplative.`,
        };
      }

      const phaseDescriptions: Record<string, string> = {
        idle: "drifting calmly through low tension",
        build: "building momentum, tension rising",
        drop: "in freefall — maximum chaos, high entropy",
      };

      // Append skills context if any were discovered during last pulse
      const skillsCtx = (pulse as any)._activeSkills ?? "";

      return {
        prependContext:
          `[CHAOS_STATE] Phase: ${snap.phase} (${phaseDescriptions[snap.phase]}). ` +
          `Energy: ${snap.energy.toFixed(0)}%. Tension: ${snap.tension.toFixed(1)}. ` +
          `Valence: ${snap.llmValence.toFixed(2)} (${snap.llmValence > 0.3 ? "expansive" : snap.llmValence < -0.3 ? "contemplative" : "neutral"}). ` +
          `Creativity: ${snap.llmTemperature.toFixed(2)}. ` +
          `Thoughts incubating: ${snap.thoughtsIncubating}/5. ` +
          `Crystallized mutations: ${snap.thoughtsCrystallized}. ` +
          `Deaths: ${snap.deaths}. Tick: ${snap.tick}.` +
          (skillsCtx ? `\n\n${skillsCtx}` : ""),
      };
    }, { name: "chaos-context-injection" });

    // ── Hook: llm_output (Feedback Loop) ─────────────────────
    api.registerHook("llm_output", async (output: any) => {
      // Feed the completion back into the chaos engine
      pulse.emitEvent({
        type: "interaction_completed",
        tokenCount: output.usage?.output ?? 0,
        durationMs: output.durationMs ?? 0,
      });

      return output;
    }, { name: "chaos-feedback-loop" });

    // ── Hook: after_tool_call (Tool Feedback) ────────────────
    api.registerHook("after_tool_call", async (ctx: any) => {
      pulse.emitEvent({
        type: "tool_executed",
        toolName: ctx.toolName ?? "unknown",
        success: !ctx.error,
      });
      return ctx;
    }, { name: "chaos-tool-feedback" });

    // ── Hook: message_received (External Input) ──────────────
    api.registerHook("message_received", async (msg: any) => {
      pulse.emitEvent({
        type: "telegram_received",
        messageLength: msg.text?.length ?? 0,
      });
      return msg;
    }, { name: "chaos-message-input" });

    // ── Hook: session_start / session_end ─────────────────────
    api.registerHook("session_start", async () => {
      pulse.emitEvent({ type: "session_started" });
    }, { name: "chaos-session-start" });

    api.registerHook("session_end", async (ctx: any) => {
      pulse.emitEvent({
        type: "session_ended",
        totalTurns: ctx.totalTurns ?? 0,
      });
      return ctx;
    }, { name: "chaos-session-end" });

    // ── Hook: after_compaction (Compaction Dream Trigger) ────
    // When OpenClaw compacts a session, emit a chaos event so the
    // Thought Cabinet captures a "compaction awareness" marker.
    // This ensures insights from compressed turns aren't silently lost.
    api.registerHook("after_compaction", async (ctx: any) => {
      console.log(`[CHAOS] Context compaction detected — emitting preservation event`);
      pulse.emitEvent({
        type: "custom",
        tensionDelta: 3,
        energyDelta: -2,
        thoughtSeed: {
          category: "compaction",
          text: "Context was compacted — some earlier conversation details may be summarized. Review session for important insights worth crystallizing.",
        },
      });
    }, { name: "chaos-compaction-awareness" });

    // ── Hook: on_error (Error Feedback) ──────────────────────
    api.registerHook("on_error", async (err: any) => {
      pulse.emitEvent({
        type: "error_occurred",
        errorType: err?.code ?? err?.message?.slice(0, 50) ?? "unknown",
      });
      return err;
    }, { name: "chaos-error-feedback" });

    // ── Tool: chaos_status ───────────────────────────────────
    api.registerTool({
      name: "chaos_status",
      description: "Show the current state of the GZMO Chaos Engine: Lorenz attractor coordinates, tension, energy, phase, mutations, and derived LLM parameters.",
      parameters: {},
      execute: async () => {
        const snap = pulse.snapshot();
        return JSON.stringify({
          ...snap,
          // Add human-readable summary
          summary: `Phase: ${snap.phase}, Energy: ${snap.energy.toFixed(0)}%, ` +
            `Temperature: ${snap.llmTemperature.toFixed(3)}, Valence: ${snap.llmValence.toFixed(3)}, ` +
            `Thoughts: ${snap.thoughtsIncubating}/5 incubating, ${snap.thoughtsCrystallized} crystallized, ` +
            `Deaths: ${snap.deaths}`,
        }, null, 2);
      },
    });

    // ── Tool: chaos_absorb ───────────────────────────────────
    api.registerTool({
      name: "chaos_absorb",
      description: "Feed a thought into the Thought Cabinet for potential absorption and crystallization. " +
        "Categories: interaction, tool_use, heartbeat, dream, wiki_edit, joke, quote, fact, poem, story.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Thought category (determines incubation time and mutation type)" },
          text: { type: "string", description: "The thought content to absorb" },
        },
        required: ["category", "text"],
      },
      execute: async (args: { category: string; text: string }) => {
        pulse.emitEvent({
          type: "custom",
          tensionDelta: 0,
          energyDelta: 0,
          thoughtSeed: { category: args.category, text: args.text },
        });
        return JSON.stringify({
          status: "thought_submitted",
          note: "Absorption is stochastic (18% chance). Check chaos_status to see if it was absorbed.",
        });
      },
    });

    // ── Tool: chaos_dice ────────────────────────────────────
    api.registerTool({
      name: "chaos_dice",
      description: "Roll a chaos-seeded D20. The roll is determined by the live Lorenz attractor state " +
        "and each result maps to one of 100 narrative events across 20 tiers of chaos theory. " +
        "The variant is selected by mixing tick + tension + chaosVal for true deterministic-chaos behavior.",
      parameters: {},
      execute: async () => {
        const snap = pulse.snapshot();
        const result = rollChaosDice("D20", snap);
        const display = formatDiceRoll(result);

        // Log the roll
        try {
          const fs = require("fs");
          fs.appendFileSync("/workspace/CHAOS_TRIGGERS.log",
            `[${new Date().toISOString()}] tick=${snap.tick} DICE: D20 rolled ${result.roll}/${result.max} (${result.tier})\n`);
        } catch (err: any) {
          console.error(`[CHAOS] Dice log write failed: ${err?.message}`);
        }

        return JSON.stringify({
          ...result,
          display,
        }, null, 2);
      },
    });

    // ── Tool: chaos_dream ────────────────────────────────────
    api.registerTool({
      name: "chaos_dream",
      description: "Manually trigger the Dream Engine to process the latest undigested session log. " +
        "The session is reflected upon via Gemini and crystallized insights are written to the Obsidian Vault.",
      parameters: {},
      execute: async () => {
        const dreamEngine = new DreamEngine();
        const snap = pulse.snapshot();
        const result = await dreamEngine.dream(SESSION_DIR, VAULT_DIR, snap);

        if (!result) {
          return JSON.stringify({
            status: "no_new_sessions",
            note: "No unprocessed sessions found, or session too short (<5 messages).",
          });
        }

        // Feed dream into Thought Cabinet
        pulse.emitEvent({
          type: "custom",
          tensionDelta: -2,
          energyDelta: 5,
          thoughtSeed: { category: "dream", text: result.insights.slice(0, 200) },
        });

        return JSON.stringify({
          status: "dream_crystallized",
          sessionId: result.sessionId,
          vaultPath: result.vaultPath,
          insightsPreview: result.insights.slice(0, 300) + "...",
        }, null, 2);
      },
    });

    // ── Tool: chaos_propose_dream ────────────────────────────
    api.registerTool({
      name: "chaos_propose_dream",
      description: "Submit a dream proposal during the HEARTBEAT identity reflection cycle. " +
        "The proposal is written to the vault and the dream_proposed event is emitted into the Chaos Engine " +
        "(Tension +5, Energy -5). The User reviews all proposals before they become identity changes.",
      parameters: {
        type: "object",
        properties: {
          title:   { type: "string", description: "Short title for the dream (e.g., 'Add arXiv scanning capability')" },
          content: { type: "string", description: "Full proposal text in markdown" },
        },
        required: ["title", "content"],
      },
      execute: async (args: { title: string; content: string }) => {
        const fs = require("fs");
        const pathMod = require("path");
        const snap = pulse.snapshot();
        const title = args.title || "untitled-dream";
        const content = args.content || "";
        const date = new Date().toISOString().slice(0, 10);
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
        const filename = `${date}-${slug}.md`;
        const vaultPath = pathMod.join(VAULT_DIR, "wiki/dreams", filename);

        const md = [
          "---",
          `date: ${date}`,
          `tick: ${snap.tick}`,
          `tension: ${snap.tension.toFixed(1)}`,
          `phase: ${snap.phase}`,
          "type: proposal",
          "tags: [dream, proposal, heartbeat]",
          "---",
          `# Dream Proposal — ${title}`,
          "",
          content,
          "",
        ].join("\n");

        fs.mkdirSync(pathMod.dirname(vaultPath), { recursive: true });
        fs.writeFileSync(vaultPath, md);

        // Emit the dream_proposed event — tension +5, energy -5
        pulse.emitEvent({
          type: "dream_proposed",
          dreamText: content.slice(0, 200),
        });

        // Log it
        try {
          fs.appendFileSync("/workspace/CHAOS_TRIGGERS.log",
            `[${new Date().toISOString()}] DREAM_PROPOSED: "${title}" → ${filename}\n`);
        } catch (err: any) {
          console.error(`[CHAOS] Dream proposal log write failed: ${err?.message}`);
        }

        return JSON.stringify({
          status: "proposal_submitted",
          vaultPath: filename,
          note: "The User will review this proposal. dream_proposed event emitted (T+5, E-5).",
        }, null, 2);
      },
    });

    // ── Research Tools ──────────────────────────────────────────
    // Phase B: Autonomous web search + arXiv scanning.
    // Agent calls these during HEARTBEAT cycles; D20 >= 16 also
    // auto-triggers webResearch in the autonomous_pulse dispatch.

    api.registerTool({
      name: "chaos_research",
      description:
        "Research a topic using Gemini-grounded web search. " +
        "Writes findings to wiki/research/ in the Obsidian Vault. " +
        "Budget: 3000 tokens/search, max 5/day, 15K/day total cap. " +
        "Curiosity decay reduces budget for repeated topics.",
      parameters: {
        type: "object",
        required: ["topic"],
        properties: {
          topic: {
            type: "string",
            description: "The topic to research (max 200 chars). Will be sanitized for injection defense.",
          },
        },
      },
      execute: async (args: { topic: string }) => {
        const snap = pulse.snapshot();
        const result = await researchEngine.webResearch(args.topic, snap);

        if (!result) {
          return JSON.stringify({
            status: "skipped",
            reason: "Budget exhausted, circuit open, or curiosity decay.",
            budget: researchEngine.getStatus(),
          }, null, 2);
        }

        // Feed research insight into the Thought Cabinet
        pulse.emitEvent({
          type: "custom",
          tensionDelta: -3,
          energyDelta: 5,
          thoughtSeed: {
            category: "research",
            text: result.insights.slice(0, 200),
          },
        });

        return JSON.stringify({
          status: "completed",
          topic: result.topic,
          insights: result.insights,
          sources: result.sources,
          tokensUsed: result.tokensUsed,
          vaultPath: result.vaultPath,
        }, null, 2);
      },
    });

    api.registerTool({
      name: "chaos_arxiv_scan",
      description:
        "Run the weekly arXiv abstract scan. Fetches papers from interest categories " +
        "(nlin.CD, cs.AI, cs.MA, cs.DC, cs.IR), scores relevance heuristically, " +
        "and generates a Gemini-synthesized digest. Writes to wiki/research/arxiv-digest-*.md. " +
        "Also runs automatically every 7 days via autonomous_pulse.",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        const snap = pulse.snapshot();
        const result = await researchEngine.arxivScan(snap);

        if (!result) {
          return JSON.stringify({
            status: "skipped",
            reason: "Budget exhausted, circuit open, or no papers retrieved.",
            budget: researchEngine.getStatus(),
          }, null, 2);
        }

        // Feed arXiv digest into the Thought Cabinet
        pulse.emitEvent({
          type: "custom",
          tensionDelta: -5,
          energyDelta: 8,
          thoughtSeed: {
            category: "research",
            text: `arXiv digest: ${result.relevantCount} relevant papers from ${result.paperCount} scanned`,
          },
        });

        return JSON.stringify({
          status: "completed",
          papersScanned: result.paperCount,
          papersRelevant: result.relevantCount,
          digest: result.digest,
          vaultPath: result.vaultPath,
        }, null, 2);
      },
    });

    api.registerTool({
      name: "chaos_research_status",
      description:
        "Check the research module status: daily token budget, web search count, " +
        "arXiv scan history, circuit breaker state, and top researched topics.",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        return JSON.stringify(researchEngine.getStatus(), null, 2);
      },
    });

    console.log("[CHAOS] Plugin registered — hooks, tools, research, and service bound.");
  },
};
