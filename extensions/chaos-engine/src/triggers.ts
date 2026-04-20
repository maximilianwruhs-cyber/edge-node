/**
 * GZMO Chaos Engine — Trigger Engine
 *
 * Direct port of triggers.rs.
 * Monitors ChaosSnapshot state and fires actions when configurable
 * thresholds are crossed. All triggers are EDGE-TRIGGERED (fire on
 * crossing, not while above/below) with per-trigger cooldowns.
 *
 * Adapted for Edge-Node: RunSkill → notify, InjectPrompt retained,
 * Notify routed to Telegram via channels.sendMessage().
 */

import { Phase, ChaosSnapshot, defaultSnapshot } from "./types";

// ── Trigger Condition ──────────────────────────────────────────────

export type ChaosMetric =
  | "tension" | "energy" | "valence" | "temperature"
  | "lorenzX" | "lorenzY" | "lorenzZ" | "chaosVal";

function extractMetric(snap: ChaosSnapshot, metric: ChaosMetric): number {
  switch (metric) {
    case "tension": return snap.tension;
    case "energy": return snap.energy;
    case "valence": return snap.llmValence;
    case "temperature": return snap.llmTemperature;
    case "lorenzX": return snap.x;
    case "lorenzY": return snap.y;
    case "lorenzZ": return snap.z;
    case "chaosVal": return snap.chaosVal;
  }
}

export type TriggerCondition =
  | { type: "above"; metric: ChaosMetric; threshold: number }
  | { type: "below"; metric: ChaosMetric; threshold: number }
  | { type: "phaseEnter"; phase: Phase }
  | { type: "crystallization" }
  | { type: "death" }
  | { type: "periodic"; intervalTicks: number };

// ── Trigger Action ─────────────────────────────────────────────────

export type NotifyLevel = "whisper" | "normal" | "urgent" | "critical";

export type TriggerAction =
  | { type: "notify"; message: string; level: NotifyLevel }
  | { type: "injectPrompt"; prompt: string }
  | { type: "emitEvent"; tensionDelta: number; energyDelta: number };

// ── Trigger Definition ─────────────────────────────────────────────

export interface ChaosTrigger {
  name: string;
  condition: TriggerCondition;
  action: TriggerAction;
  cooldownTicks: number;
  enabled: boolean;
  lastFired: number;
}

export interface TriggerFired {
  triggerName: string;
  action: TriggerAction;
}

// ── Trigger Engine ─────────────────────────────────────────────────

export class TriggerEngine {
  private triggers: ChaosTrigger[] = [];
  private prevSnapshot: ChaosSnapshot = defaultSnapshot();

  static withDefaults(): TriggerEngine {
    const engine = new TriggerEngine();

    // ─── Critical Tension Alerts ────────────────────────────
    engine.add({
      name: "tension_critical",
      condition: { type: "above", metric: "tension", threshold: 85.0 },
      action: { type: "notify", message: "⚡ Tension critically high — system under heavy load!", level: "critical" },
      cooldownTicks: 90,  // ~30s
      enabled: true, lastFired: 0,
    });

    engine.add({
      name: "tension_calm",
      condition: { type: "below", metric: "tension", threshold: 15.0 },
      action: { type: "notify", message: "🌊 Tension critically low — the engine grows dormant…", level: "whisper" },
      cooldownTicks: 1500, // ~8 min (prevents spam during normal idle)
      enabled: true, lastFired: 0,
    });

    // ─── Energy Warnings ────────────────────────────────────
    engine.add({
      name: "energy_critical",
      condition: { type: "below", metric: "energy", threshold: 10.0 },
      action: { type: "notify", message: "🔋 Energy critical — approaching death threshold!", level: "critical" },
      cooldownTicks: 90,
      enabled: true, lastFired: 0,
    });

    // ─── Phase Transitions ──────────────────────────────────
    engine.add({
      name: "phase_drop",
      condition: { type: "phaseEnter", phase: Phase.Drop },
      action: { type: "notify", message: "📉 Phase transition: DROP — energy collapsing, maximum chaos.", level: "urgent" },
      cooldownTicks: 30,  // ~10s
      enabled: true, lastFired: 0,
    });

    // ─── Death & Rebirth ────────────────────────────────────
    engine.add({
      name: "death_event",
      condition: { type: "death" },
      action: { type: "notify", message: "💀 Engine died and was reborn. Death count increased.", level: "urgent" },
      cooldownTicks: 1,
      enabled: true, lastFired: 0,
    });

    // ─── Crystallization Events ─────────────────────────────
    engine.add({
      name: "crystallization",
      condition: { type: "crystallization" },
      action: { type: "notify", message: "🔮 A thought has crystallized — permanent mutation applied.", level: "normal" },
      cooldownTicks: 1,
      enabled: true, lastFired: 0,
    });

    // ─── Periodic Autonomous Heartbeat ──────────────────────
    engine.add({
      name: "autonomous_pulse",
      condition: { type: "periodic", intervalTicks: 5200 }, // ~30 minutes (was 520/~3min — too aggressive for API quota)
      action: {
        type: "injectPrompt",
        prompt: "[AUTONOMOUS] Your chaos engine has been running for 30 minutes. " +
          "Read HEARTBEAT.md and follow the night shift protocol. " +
          "If tension is high, consider what's causing it. " +
          "If energy is low, conserve effort. " +
          "Work through one priority task from the heartbeat checklist.",
      },
      cooldownTicks: 5200,
      enabled: true, lastFired: 0,
    });

    return engine;
  }

  add(trigger: ChaosTrigger): void {
    this.triggers.push(trigger);
  }

  setEnabled(name: string, enabled: boolean): void {
    for (const t of this.triggers) {
      if (t.name === name) t.enabled = enabled;
    }
  }

  /**
   * Evaluate all triggers against the current snapshot.
   * Returns fired actions. Call once per tick.
   */
  evaluate(snap: ChaosSnapshot): TriggerFired[] {
    const fired: TriggerFired[] = [];

    for (const trigger of this.triggers) {
      if (this.shouldFire(trigger, snap)) {
        fired.push({ triggerName: trigger.name, action: trigger.action });
        trigger.lastFired = snap.tick;
      }
    }

    this.prevSnapshot = { ...snap };
    return fired;
  }

  private shouldFire(trigger: ChaosTrigger, snap: ChaosSnapshot): boolean {
    if (!trigger.enabled) return false;
    if (snap.tick - trigger.lastFired < trigger.cooldownTicks) return false;

    const prev = this.prevSnapshot;

    switch (trigger.condition.type) {
      case "above": {
        const val = extractMetric(snap, trigger.condition.metric);
        const prevVal = extractMetric(prev, trigger.condition.metric);
        return val > trigger.condition.threshold && prevVal <= trigger.condition.threshold;
      }
      case "below": {
        const val = extractMetric(snap, trigger.condition.metric);
        const prevVal = extractMetric(prev, trigger.condition.metric);
        return val < trigger.condition.threshold && prevVal >= trigger.condition.threshold;
      }
      case "phaseEnter":
        return snap.phase === trigger.condition.phase && prev.phase !== trigger.condition.phase;
      case "crystallization":
        return snap.lastCrystallization !== null;
      case "death":
        return snap.deaths > prev.deaths;
      case "periodic":
        return snap.tick > 0 && snap.tick % trigger.condition.intervalTicks === 0;
    }
  }
}
