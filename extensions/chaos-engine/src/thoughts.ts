/**
 * GZMO Chaos Engine — Thought Cabinet
 *
 * Direct port of thoughts.rs.
 * Disco Elysium-inspired internalization system:
 *   1. Lore/skill outputs are stochastically ABSORBED (18% chance)
 *   2. Thoughts INCUBATE for N ticks (category-dependent)
 *   3. Mature thoughts CRYSTALLIZE into permanent physics mutations
 *
 * Crystallizations are IRREVERSIBLE — they permanently reshape the
 * Lorenz attractor's topology and the engine's physical constants.
 */

import {
  Mutations, defaultMutations,
  MutationEffect, CrystallizationEvent,
} from "./types";

const MAX_SLOTS = 5;
const ABSORPTION_THRESHOLD = 0.18; // 18% chance per attempt

// ── Incubation durations (ticks at 174 BPM ≈ 3 ticks/sec) ─────────

const INCUBATION_MAP: Record<string, number> = {
  sound: 8,        // ~3s
  dice_crit: 10,   // ~3s
  joke: 15,        // ~5s
  poem: 25,        // ~8s
  quote: 30,       // ~10s
  card: 35,        // ~12s
  story: 40,       // ~14s
  fact: 45,        // ~15s
  persona: 60,     // ~20s
  // Edge-Node specific categories
  interaction: 20, // ~7s
  tool_use: 15,    // ~5s
  heartbeat: 30,   // ~10s
  dream: 50,       // ~17s
  wiki_edit: 40,   // ~14s
};

const DEFAULT_INCUBATION = 20;

// ── Cognitive load constants ───────────────────────────────────────

const DRAIN_PER_THOUGHT = 0.15;     // +15% energy drain per incubating thought
const NOISE_PER_THOUGHT = 0.5;      // +0.5 Lorenz σ perturbation per thought

// ── A single incubating thought ────────────────────────────────────

interface IncubatingThought {
  category: string;
  text: string;
  tickAbsorbed: number;
  ticksRequired: number;
  ticksRemaining: number;
}

// ── Thought Cabinet ────────────────────────────────────────────────

export class ThoughtCabinet {
  private slots: (IncubatingThought | null)[] = new Array(MAX_SLOTS).fill(null);
  mutations: Mutations = defaultMutations();

  /**
   * Attempt to absorb a thought. Returns true if absorbed.
   * Absorption is stochastic (18% base chance) and requires a free slot.
   */
  tryAbsorb(category: string, text: string, tick: number, chaosRoll: number): boolean {
    // Check absorption threshold
    if (chaosRoll > ABSORPTION_THRESHOLD) return false;

    // Find free slot
    const freeIdx = this.slots.findIndex(s => s === null);
    if (freeIdx === -1) return false; // Cabinet full

    const ticksRequired = INCUBATION_MAP[category] ?? DEFAULT_INCUBATION;

    this.slots[freeIdx] = {
      category,
      text,
      tickAbsorbed: tick,
      ticksRequired,
      ticksRemaining: ticksRequired,
    };

    return true;
  }

  /**
   * Advance all incubating thoughts by one tick.
   * Returns any crystallization events that occurred.
   */
  tick(): CrystallizationEvent[] {
    const crystallizations: CrystallizationEvent[] = [];

    for (let i = 0; i < this.slots.length; i++) {
      const thought = this.slots[i];
      if (thought === null) continue;

      thought.ticksRemaining--;

      if (thought.ticksRemaining <= 0) {
        // Crystallize!
        const mutation = this.computeMutation(thought.category);
        this.applyMutation(mutation);

        crystallizations.push({
          category: thought.category,
          text: thought.text,
          tickAbsorbed: thought.tickAbsorbed,
          tickCrystallized: 0, // Set by PulseLoop
          mutation,
        });

        // Free the slot
        this.slots[i] = null;
      }
    }

    return crystallizations;
  }

  /** Number of occupied slots. */
  occupiedSlots(): number {
    return this.slots.filter(s => s !== null).length;
  }

  /** Cognitive drain multiplier: 1.0 + 0.15 per incubating thought. */
  activeDrainMultiplier(): number {
    return 1.0 + this.occupiedSlots() * DRAIN_PER_THOUGHT;
  }

  /** Active Lorenz σ noise from incubating thoughts. */
  activeLorenzNoise(): number {
    return this.occupiedSlots() * NOISE_PER_THOUGHT;
  }

  // ── Crystallization Mutations ──────────────────────────────────

  private computeMutation(category: string): MutationEffect {
    switch (category) {
      case "joke":
        return { target: "gravity", delta: -0.1, description: "Humor lightens the engine's gravitational pull" };
      case "quote":
        return { target: "lorenz_rho", delta: 0.3, description: "Wisdom reshapes the attractor's orbital topology" };
      case "fact":
      case "wiki_edit":
        return { target: "friction", delta: -0.02, description: "Truth reduces systemic resistance" };
      case "poem":
        return { target: "gravity+rho", delta: -0.05, description: "Verse loosens the engine's grip on determinism" };
      case "story":
        return { target: "lorenz_rho", delta: 0.5, description: "Narrative restructures phase space geometry" };
      case "card":
        return { target: "friction", delta: -0.03, description: "A forged card greases the gears of chaos" };
      case "dice_crit":
        return { target: "tension_bias", delta: -2.0, description: "Fortune's memory lowers baseline anxiety" };
      case "sound":
        return { target: "friction", delta: -0.01, description: "Auditory resonance smooths turbulent transitions" };
      case "persona":
        return { target: "gravity+rho", delta: 0.2, description: "Identity crystallization adds existential weight" };
      // Edge-Node specific
      case "interaction":
        return { target: "friction", delta: -0.01, description: "Conversation flow smooths resistance" };
      case "tool_use":
        return { target: "gravity", delta: -0.05, description: "Successful tool use reduces gravitational burden" };
      case "heartbeat":
        return { target: "tension_bias", delta: -1.0, description: "Routine heartbeat calms systemic anxiety" };
      case "dream":
        return { target: "lorenz_rho", delta: 0.8, description: "Dream consolidation profoundly reshapes attractor topology" };
      default:
        return { target: "friction", delta: -0.005, description: "Unknown experience marginally reduces friction" };
    }
  }

  private applyMutation(mutation: MutationEffect): void {
    this.mutations.totalCrystallized++;

    switch (mutation.target) {
      case "gravity":
        this.mutations.gravityMod = clamp(this.mutations.gravityMod + mutation.delta, -5.0, 5.0);
        break;
      case "friction":
        this.mutations.frictionMod = clamp(this.mutations.frictionMod + mutation.delta, -0.5, 0.5);
        break;
      case "lorenz_rho":
        this.mutations.lorenzRhoMod = clamp(this.mutations.lorenzRhoMod + mutation.delta, -10.0, 10.0);
        break;
      case "tension_bias":
        this.mutations.tensionBias = clamp(this.mutations.tensionBias + mutation.delta, -30.0, 30.0);
        break;
      case "gravity+rho":
        // Compound mutation: gravity shift + rho shift
        this.mutations.gravityMod = clamp(this.mutations.gravityMod + mutation.delta, -5.0, 5.0);
        // Rho gets a larger effect for compound mutations
        const rhoEffect = mutation.target === "gravity+rho" && mutation.delta > 0
          ? mutation.delta * 4.0  // persona: +0.2 gravity, +0.8 rho
          : mutation.delta * 2.0; // poem: -0.05 gravity, -0.1 rho (wait, poem is +0.1 rho in original)
        this.mutations.lorenzRhoMod = clamp(
          this.mutations.lorenzRhoMod + Math.abs(rhoEffect),
          -10.0, 10.0,
        );
        break;
    }
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
