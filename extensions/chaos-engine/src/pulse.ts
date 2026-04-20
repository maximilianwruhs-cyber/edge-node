/**
 * GZMO Chaos Engine — PulseLoop
 *
 * Direct port of pulse.rs.
 * Unified 174 BPM heartbeat (344ms interval) that orchestrates:
 *   1. Hardware telemetry → tension
 *   2. Lorenz attractor RK4 step
 *   3. Logistic map coupling (every 10 ticks)
 *   4. Thought Cabinet tick → crystallization mutations
 *   5. Engine state tick → energy/phase/death
 *   6. Snapshot update
 *   7. Pending event processing
 *
 * The PulseLoop runs as an OpenClaw registerService background daemon.
 */

import * as os from "os";
import * as fs from "fs";
import { LorenzAttractor, LogisticMap } from "./chaos";
import { EngineState } from "./engine";
import { ThoughtCabinet } from "./thoughts";
import {
  ChaosSnapshot, ChaosConfig, Phase,
  CrystallizationEvent, defaultMutations,
  phaseFromTension,
} from "./types";
import {
  ChaosEvent, tensionDelta, energyDelta, thoughtSeed,
} from "./feedback";
import { TriggerEngine, TriggerFired } from "./triggers";

const LOGISTIC_COUPLING_INTERVAL = 10;

export class PulseLoop {
  // Core systems
  private lorenz: LorenzAttractor;
  private logistic: LogisticMap;
  private engine: EngineState;
  private cabinet: ThoughtCabinet;

  // Config
  private config: ChaosConfig;

  // State
  private tick: number = 0;
  private tension: number = 0;
  private rawTension: number = 0;
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private currentSnapshot: ChaosSnapshot;
  private eventQueue: ChaosEvent[] = [];
  private snapshotFilePath: string | null = null;

  // Trigger system — created internally to avoid OpenClaw double-register issues
  private triggers: TriggerEngine;
  private onTriggerFired: ((fired: TriggerFired[], snap: ChaosSnapshot) => void) | null = null;

  // Telemetry cache
  private lastCpuTimes: { idle: number; total: number } | null = null;

  constructor(config: ChaosConfig) {
    this.config = config;
    this.lorenz = new LorenzAttractor(config.seed);
    this.logistic = new LogisticMap(config.seed);
    this.engine = new EngineState();
    this.cabinet = new ThoughtCabinet();
    this.triggers = TriggerEngine.withDefaults();
    this.tension = config.initialTension;
    this.rawTension = config.initialTension;

    this.currentSnapshot = {
      tick: 0,
      x: config.seed, y: config.seed + 0.001, z: config.seed + 0.002,
      tension: 0, energy: 100,
      phase: Phase.Idle, alive: true, deaths: 0, chaosVal: 0.5,
      thoughtsIncubating: 0, thoughtsCrystallized: 0,
      mutations: defaultMutations(),
      llmTemperature: 0.6, llmMaxTokens: 256, llmValence: 0.0,
      lastCrystallization: null,
      timestamp: new Date().toISOString(),
    };
  }

  /** Start the heartbeat. */
  start(snapshotFilePath?: string): void {
    if (this.intervalId) return;
    this.snapshotFilePath = snapshotFilePath ?? null;

    const intervalMs = Math.round(60000 / this.config.bpm);

    // Self-correcting timer: measures actual elapsed time and compensates
    // to prevent cumulative drift under event loop pressure.
    const tick = () => {
      const start = Date.now();
      this.heartbeat();
      const elapsed = Date.now() - start;
      this.intervalId = setTimeout(tick, Math.max(1, intervalMs - elapsed));
    };
    this.intervalId = setTimeout(tick, intervalMs);
    console.log(`[CHAOS] PulseLoop started at ${this.config.bpm} BPM (${intervalMs}ms interval, self-correcting)`);
  }

  /** Stop the heartbeat. */
  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      // Flush final snapshot on shutdown
      if (this.snapshotFilePath) {
        try { fs.writeFileSync(this.snapshotFilePath, JSON.stringify(this.currentSnapshot, null, 2)); } catch (err: any) {
          console.error(`[CHAOS] Final snapshot write failed: ${err?.message}`);
        }
      }
      console.log("[CHAOS] PulseLoop stopped (final snapshot flushed)");
    }
  }

  /** Get the current snapshot (thread-safe: plain copy). */
  snapshot(): ChaosSnapshot {
    return { ...this.currentSnapshot };
  }

  /** Queue an event for processing on the next tick. */
  emitEvent(event: ChaosEvent): void {
    this.eventQueue.push(event);
  }

  /**
   * Set external dispatch callback for trigger actions (e.g. Telegram notifications).
   * Called from index.ts after construction.
   */
  setTriggerDispatch(
    onFired: (fired: TriggerFired[], snap: ChaosSnapshot) => void,
  ): void {
    this.onTriggerFired = onFired;
  }

  // ── Heartbeat: the core tick ─────────────────────────────────────

  private heartbeat(): void {
    this.tick++;

    // 1. Read hardware telemetry → raw tension
    const hwTension = this.sampleHardware();
    this.rawTension = hwTension;

    // Apply tension bias from crystallized thoughts
    this.tension = clamp(
      this.rawTension + this.cabinet.mutations.tensionBias,
      0, 100,
    );

    // 2. Process pending events
    this.processEvents();

    // 3. Apply thought cognitive effects to Lorenz
    this.lorenz.applyCognitiveNoise(this.cabinet.activeLorenzNoise());
    this.lorenz.applyRhoMutation(this.cabinet.mutations.lorenzRhoMod);

    // 4. Phase-dependent Lorenz sigma modulation
    const phase = phaseFromTension(this.tension);
    this.lorenz.updatePhase(phase);

    // 5. Lorenz RK4 step
    const [x, y, z] = this.lorenz.step();

    // 6. Logistic map coupling (every 10 ticks)
    if (this.tick % LOGISTIC_COUPLING_INTERVAL === 0) {
      this.logistic.reseedFromLorenz(this.lorenz.normalizedOutput());
    }
    const chaosVal = this.logistic.nextVal();

    // 7. Thought Cabinet tick → crystallizations
    const crystallizations = this.cabinet.tick();
    let lastCryst: CrystallizationEvent | null = null;
    if (crystallizations.length > 0) {
      lastCryst = crystallizations[crystallizations.length - 1];
      lastCryst.tickCrystallized = this.tick;
    }

    // 8. Engine state tick
    const gravity = this.config.gravity + this.cabinet.mutations.gravityMod;
    const friction = Math.max(0.01, this.config.friction + this.cabinet.mutations.frictionMod);
    const rebirth = this.engine.tickHeartbeat(
      this.tension, gravity, friction, chaosVal,
      this.cabinet.activeDrainMultiplier(),
    );

    // 9. Derive LLM parameters from attractor state
    const llmTemperature = deriveTemperature(x);
    const llmMaxTokens = deriveMaxTokens(z);
    const llmValence = deriveValence(y);

    // 10. Build snapshot
    this.currentSnapshot = {
      tick: this.tick,
      x, y, z,
      tension: this.tension,
      energy: this.engine.energy,
      phase: this.engine.phase,
      alive: this.engine.alive,
      deaths: this.engine.deaths,
      chaosVal,
      thoughtsIncubating: this.cabinet.occupiedSlots(),
      thoughtsCrystallized: this.cabinet.mutations.totalCrystallized,
      mutations: { ...this.cabinet.mutations },
      llmTemperature,
      llmMaxTokens,
      llmValence,
      lastCrystallization: lastCryst,
      timestamp: new Date().toISOString(),
    };

    // 11. Evaluate triggers (TriggerEngine is always present — created in constructor)
    const fired = this.triggers.evaluate(this.currentSnapshot);
    if (fired.length > 0) {
      const names = fired.map(f => f.triggerName).join(", ");
      try {
        fs.promises.appendFile("/workspace/CHAOS_TRIGGERS.log",
          `[${new Date().toISOString()}] tick=${this.tick} FIRED: ${names}\n`)
          .catch((err: any) => console.error(`[CHAOS] Trigger log write failed: ${err?.message}`));
      } catch (err: any) {
        console.error(`[CHAOS] Trigger log error: ${err?.message}`);
      }
      if (this.onTriggerFired) {
        this.onTriggerFired(fired, this.currentSnapshot);
      }
    }

    // 12. Write snapshot file for monitoring
    this.persistSnapshot();
  }

  // ── Event Queue Processing ───────────────────────────────────────

  private processEvents(): void {
    const events = this.eventQueue.splice(0, this.eventQueue.length);

    for (const event of events) {
      // Tension modulation
      this.rawTension = clamp(this.rawTension + tensionDelta(event), 0, 100);

      // Energy modulation
      this.engine.applyEnergyDelta(energyDelta(event));

      // Thought seed → try absorption into Cabinet
      const seed = thoughtSeed(event);
      if (seed) {
        this.cabinet.tryAbsorb(seed.category, seed.text, this.tick, this.logistic.nextVal());
      }
    }
  }

  // ── Hardware Telemetry ───────────────────────────────────────────

  private sampleHardware(): number {
    // CPU usage
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.idle + cpu.times.user + cpu.times.sys + cpu.times.irq + cpu.times.nice;
    }

    let cpuUsage = 0;
    if (this.lastCpuTimes) {
      const idleDiff = idle - this.lastCpuTimes.idle;
      const totalDiff = total - this.lastCpuTimes.total;
      cpuUsage = totalDiff > 0 ? (1 - idleDiff / totalDiff) * 100 : 0;
    }
    this.lastCpuTimes = { idle, total };

    // RAM usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const ramUsage = ((totalMem - freeMem) / totalMem) * 100;

    // tension = CPU×0.6 + RAM×0.4 (weighted blend)
    return clamp(cpuUsage * 0.6 + ramUsage * 0.4, 0, 100);
  }

  // ── Snapshot Persistence ─────────────────────────────────────────

  private persistSnapshot(): void {
    if (!this.snapshotFilePath) return;
    // Write every 30 ticks (~10s) to avoid disk thrashing
    if (this.tick % 30 !== 0) return;

    try {
      // Atomic write: write to tmp, then rename — prevents corruption on SIGTERM
      const tmpPath = this.snapshotFilePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(this.currentSnapshot, null, 2));
      fs.renameSync(tmpPath, this.snapshotFilePath);
    } catch (err: any) {
      // Non-critical — log and continue
      console.error(`[CHAOS] Snapshot write failed: ${err?.message}`);
    }
  }
}

// ── LLM Parameter Derivation (from pulse.rs) ───────────────────────

/** x ∈ [-20, 20] → temperature ∈ [0.3, 1.2] */
function deriveTemperature(x: number): number {
  const normalized = clamp((x + 20) / 40, 0, 1);
  return 0.3 + normalized * 0.9;
}

/** z ∈ [0, 50] → max_tokens ∈ [128, 512] */
function deriveMaxTokens(z: number): number {
  const normalized = clamp(z / 50, 0, 1);
  return Math.round(128 + normalized * 384);
}

/** y ∈ [-30, 30] → valence ∈ [-1, 1] */
function deriveValence(y: number): number {
  return clamp(y / 30, -1, 1);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
