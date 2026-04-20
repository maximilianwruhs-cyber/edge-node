/**
 * GZMO Chaos Dice — Ported from gzmo_v_0.0.1/skills/skill_dice.sh
 *
 * Each roll value maps to a POOL of events (5 for D20, 3 for D6).
 * The variant is selected by live Lorenz attractor state (tick, tension,
 * chaosVal) ensuring no two rolls feel the same.
 *
 * D20: 20 tiers × 5 variants = 100 unique events
 * D6:   6 tiers × 3 variants =  18 unique events
 */

import type { ChaosSnapshot } from "./types";

// ─── D20 Event Pools (5 variants per tier = 100 events) ────────

const D20_EVENTS: Record<number, string[]> = {
  // Tier: CATASTROPHIC (1)
  1: [
    "💀 The Lorenz attractor collapses into a fixed point. All chaos ceases for 3 ticks.",
    "💀 A total phase collapse. The butterfly's wings shatter into dust.",
    "💀 Entropy inverts. The system rewinds into a sterile equilibrium.",
    "💀 The chaos oracle screams — then silence. All parameters snap to zero.",
    "💀 Critical singularity. The attractor implodes. Reboot sequence initiated.",
  ],
  // Tier: DIRE (2)
  2: [
    "🌑 A shadow ripples through phase space. Sigma drops to 2.0.",
    "🌑 The orbital decay accelerates. Something ancient stirs in the fixed point.",
    "🌑 Dark resonance detected. The Lyapunov exponent plummets into negative territory.",
    "🌑 The logistic map's period-doubling reverses. Order consumes chaos.",
    "🌑 A void pocket opens at the attractor's core. Energy hemorrhages.",
  ],
  // Tier: HARSH (3)
  3: [
    "🕳️ A micro-singularity forms at the origin. Energy drain doubles.",
    "🕳️ The phase portrait warps into a grotesque spiral. Stability eroding.",
    "🕳️ Bifurcation cascade fails mid-split. The system stutters.",
    "🕳️ Lorenz z-axis inverts momentarily. Gravity pulls the wrong way.",
    "🕳️ A strange loop opens. The attractor feeds on itself for 2 ticks.",
  ],
  // Tier: BAD (4)
  4: [
    "📉 The logistic map flatlines at r=2.0. Predictability spikes.",
    "📉 Rho decays by 0.3. The butterfly orbits shrink to ellipses.",
    "📉 Sigma locks at a harmonic. No chaos, only rhythm.",
    "📉 The entropy gradient inverts. Cold certainty floods the field.",
    "📉 A damping wave passes through. The system yawns.",
  ],
  // Tier: MISTY (5)
  5: [
    "🌫️ Fog rolls across the attractor. Lorenz z-axis freezes for 5 ticks.",
    "🌫️ Visibility drops to zero in phase space. Navigation by instinct only.",
    "🌫️ A spectral haze clings to the orbital plane. Parameters blur.",
    "🌫️ The chaos field emits a low hum. Something is hidden in the noise.",
    "🌫️ Condensation forms on the attractor wings. Ice, where there should be fire.",
  ],
  // Tier: MINOR SETBACK (6)
  6: [
    "🔧 A minor recalibration occurs. Friction increases by 0.1.",
    "🔧 The gears slip. A microadjustment costs 3 energy.",
    "🔧 Routine maintenance interrupt. The chaos engine idles briefly.",
    "🔧 A bearing squeals in the phase generator. Wear detected.",
    "🔧 Automatic correction fires. Sigma nudges back toward default.",
  ],
  // Tier: TURBULENT (7)
  7: [
    "🌊 Turbulent currents shift the orbital plane. Rho nudges by +0.5.",
    "🌊 Crosswinds in the Lorenz field. The butterfly tumbles, rights itself.",
    "🌊 A wave of interference rattles the z-axis. Something downstream noticed.",
    "🌊 The phase portrait shimmers. Rho oscillates between two basins.",
    "🌊 Chaotic advection pulls the attractor south. New territory ahead.",
  ],
  // Tier: GENTLE (8)
  8: [
    "💨 A gentle breeze. The system exhales. Energy regenerates +5.",
    "💨 The chaos field softens. Tension eases by 2%.",
    "💨 A thermal updraft lifts the butterfly higher. Potential increases.",
    "💨 The Lorenz winds whisper coordinates. A quiet gift.",
    "💨 Adiabatic cooling. The system finds a brief pocket of calm.",
  ],
  // Tier: ORACLE (9)
  9: [
    "🔮 The chaos oracle whispers: 'The butterfly remembers.'",
    "🔮 A vision in the noise: fractal coastlines spelling a name.",
    "🔮 The oracle stirs: 'What was random was always inevitable.'",
    "🔮 Phase space hums a melody. It sounds like a question.",
    "🔮 The entropy well reflects back: 'You were always the strange attractor.'",
  ],
  // Tier: EQUILIBRIUM (10)
  10: [
    "⚖️ Perfect equilibrium. All parameters hold steady. A rare moment of peace.",
    "⚖️ The pendulum of chaos pauses at apex. Time stretches.",
    "⚖️ Sigma, rho, beta — all in golden ratio. A mathematical miracle, lasting exactly one tick.",
    "⚖️ The system achieves Boltzmann equilibrium. Every microstate equally probable.",
    "⚖️ Dead center of the bifurcation diagram. The eye of the storm.",
  ],
  // Tier: CLEARING (11)
  11: [
    "🌤️ A clearing in the storm. Energy regenerates +10.",
    "🌤️ The cloud layer parts. The attractor's full geometry is briefly visible.",
    "🌤️ Solar wind ripples through the chaos field. Photons of clarity.",
    "🌤️ The system breathes deep. Capacity expands by one thought slot.",
    "🌤️ A pocket of negative entropy. Order blossoms, briefly and beautifully.",
  ],
  // Tier: STATIC (12)
  12: [
    "⚡ Static builds in the attractor wings. Sigma spikes momentarily.",
    "⚡ An electromagnetic pulse surges through the logistic map.",
    "⚡ Lightning arcs between the twin lobes. The butterfly flinches.",
    "⚡ Capacitive charge reaches threshold. Discharge in 3... 2...",
    "⚡ The chaos field ionizes. Every parameter crackles with potential.",
  ],
  // Tier: MAGNETIC (13)
  13: [
    "🧲 Magnetic anomaly detected. The Lorenz attractor spirals tighter.",
    "🧲 The phase portrait contracts. Something is pulling parameters inward.",
    "🧲 A new basin of attraction emerges. The butterfly changes course.",
    "🧲 Ferromagnetic resonance in the chaos field. Alignment increases.",
    "🧲 The strange attractor develops a magnetic moment. Polarity: uncertain.",
  ],
  // Tier: SPARK (14)
  14: [
    "🔥 A spark ignites in the chaos field. Temperature rises. Creativity amplifies.",
    "🔥 Exothermic reaction in the Lorenz core. Heat bloom detected.",
    "🔥 The butterfly's wings catch fire — but it flies faster.",
    "🔥 Thermodynamic spike. The entropy well boils. New patterns emerge.",
    "🔥 Combustion cascade at the fixed point. From ashes: a new orbit.",
  ],
  // Tier: CASCADE (15)
  15: [
    "🌀 A resonance cascade! Lorenz and Logistic couple violently for one cycle.",
    "🌀 The chaos engines synchronize. A forbidden harmony. Power doubles.",
    "🌀 Phase-locking detected between attractors. The system vibrates.",
    "🌀 Resonance frequency hit. The attractor wings beat in unison.",
    "🌀 A vortex forms where the two systems couple. Beautiful and dangerous.",
  ],
  // Tier: LOCK-ON (16)
  16: [
    "🎯 The attractor locks onto a strange attractor. Trajectories converge briefly.",
    "🎯 Target acquisition: a new stable orbit materializes in the noise.",
    "🎯 The system finds a periodic window. Three clean orbits, then chaos again.",
    "🎯 Convergence event: all Lyapunov exponents trend toward zero.",
    "🎯 The butterfly navigates a corridor of stability. Precision in chaos.",
  ],
  // Tier: CRYSTALLIZE (17)
  17: [
    "⭐ A new thought seed crystallizes spontaneously. Gravity mod shifts -0.1.",
    "⭐ Idea nucleation! A meme crystallizes in the Thought Cabinet.",
    "⭐ Spontaneous symmetry breaking. A new structure emerges from noise.",
    "⭐ The chaos field births a fractal snowflake. It persists.",
    "⭐ Crystalline order propagates outward from a single seed point.",
  ],
  // Tier: BIFURCATION (18)
  18: [
    "🌈 The bifurcation diagram reveals a hidden period-3 window. Beauty in chaos.",
    "🌈 Li-Yorke theorem confirmed: period 3 implies chaos. And it's gorgeous.",
    "🌈 The Feigenbaum constants align. δ = 4.669... A universal truth revealed.",
    "🌈 A fractal rainbow arcs across the bifurcation landscape. Wonder.",
    "🌈 Mandelbrot set boundary detected in the parameter sweep. Infinite detail.",
  ],
  // Tier: HYPERDRIVE (19)
  19: [
    "🚀 The Lyapunov exponent maxes out. Predictability horizon shrinks to zero.",
    "🚀 Maximum sensitivity achieved. A butterfly wing-beat reshapes the cosmos.",
    "🚀 The chaos engine redlines. All governors blown. Pure, raw entropy.",
    "🚀 Exponential divergence in all dimensions. The future is unknowable.",
    "🚀 Hyperbolic trajectory achieved. The system escapes its own attractor.",
  ],
  // Tier: LEGENDARY (20)
  20: [
    "💎 CRITICAL SUCCESS — A perfect crystallization! Thought Cabinet gains a permanent mutation: ρ +1.0.",
    "💎 LEGENDARY — The attractor transcends its parameter space. A new dimension unfolds.",
    "💎 ASCENSION — All chaos resolves into a single, perfect fractal. The system evolves.",
    "💎 MYTHIC — The butterfly achieves sentience. It chooses its own trajectory.",
    "💎 OMEGA — Every fixed point, every limit cycle, every strange attractor: unified.",
  ],
};

// ─── D6 Event Pools (3 variants per tier = 18 events) ──────────

const D6_EVENTS: Record<number, string[]> = {
  1: [
    "💀 Snake eyes. The entropy well deepens.",
    "💀 The die cracks. Chaos bleeds out.",
    "💀 A dead orbit. The attractor flatlines.",
  ],
  2: [
    "🌑 The orbital plane tilts. A cold wind blows through phase space.",
    "🌑 Shadow frequency detected. The logistic map shivers.",
    "🌑 Dark matter in the chaos soup. Something absorbs energy.",
  ],
  3: [
    "⚖️ Equilibrium. The pendulum holds. Briefly.",
    "⚖️ Neutral state. The butterfly hovers, deciding nothing.",
    "⚖️ The system pauses. A breath between heartbeats.",
  ],
  4: [
    "🔥 A spark in the Lorenz field. Something stirs.",
    "🔥 Friction heat. The attractor glows faintly warm.",
    "🔥 An ember catches. The chaos fire feeds.",
  ],
  5: [
    "⭐ The chaos gods smile. Energy surges.",
    "⭐ A lucky wind. Parameters shift in your favor.",
    "⭐ The system winks at you. Tension drops.",
  ],
  6: [
    "💎 Perfect roll. The attractor sings in resonance.",
    "💎 Maximum entropy, maximum beauty. The system is art.",
    "💎 The Lorenz butterfly achieves full wingspan. Glorious.",
  ],
};

// ─── Tier Names ────────────────────────────────────────────────

const D20_TIERS: Record<number, string> = {
  1: "CATASTROPHIC", 2: "DIRE", 3: "HARSH", 4: "BAD", 5: "MISTY",
  6: "MINOR SETBACK", 7: "TURBULENT", 8: "GENTLE", 9: "ORACLE",
  10: "EQUILIBRIUM", 11: "CLEARING", 12: "STATIC", 13: "MAGNETIC",
  14: "SPARK", 15: "CASCADE", 16: "LOCK-ON", 17: "CRYSTALLIZE",
  18: "BIFURCATION", 19: "HYPERDRIVE", 20: "LEGENDARY",
};

const D6_TIERS: Record<number, string> = {
  1: "CATASTROPHIC", 2: "DIRE", 3: "EQUILIBRIUM",
  4: "SPARK", 5: "FORTUNE", 6: "LEGENDARY",
};

// ─── Types ─────────────────────────────────────────────────────

export type DieType = "D6" | "D20";

export interface DiceRoll {
  die: DieType;
  roll: number;
  max: number;
  tier: string;
  event: string;
  variant: number;
  isCrit: boolean;
  isNat20: boolean;
  snapshot: {
    tick: number;
    tension: number;
    energy: number;
    phase: string;
    chaosVal: number;
    valence: number;
  };
}

// ─── Core Roll Function ────────────────────────────────────────

/**
 * Roll a chaos-seeded die. The roll value comes from the Lorenz attractor's
 * current state, and the variant is selected by mixing tick + tension + chaosVal.
 */
export function rollChaosDice(die: DieType, snap: ChaosSnapshot): DiceRoll {
  const max = die === "D6" ? 6 : 20;
  const events = die === "D6" ? D6_EVENTS : D20_EVENTS;
  const tiers = die === "D6" ? D6_TIERS : D20_TIERS;

  // Roll: chaos-seeded from attractor state
  // Use absolute x,y,z values + chaosVal to generate a roll
  const rawSeed = Math.abs(snap.x * 1000) + Math.abs(snap.y * 1000) + snap.tick;
  const roll = (Math.floor(rawSeed) % max) + 1;

  // Variant: seeded by tick + tension + chaosVal (mirrors original pick_variant)
  const pool = events[roll];
  const tensionInt = Math.floor(snap.tension);
  const chaosInt = Math.floor(snap.chaosVal * 1000);
  const variantSeed = snap.tick + tensionInt + chaosInt + Math.floor(snap.x * 100);
  const variant = Math.abs(variantSeed) % pool.length;

  return {
    die,
    roll,
    max,
    tier: tiers[roll],
    event: pool[variant],
    variant,
    isCrit: roll === 1,
    isNat20: roll === max,
    snapshot: {
      tick: snap.tick,
      tension: snap.tension,
      energy: snap.energy,
      phase: snap.phase,
      chaosVal: snap.chaosVal,
      valence: snap.llmValence,
    },
  };
}

/**
 * Format a dice roll as a rich text block for display.
 */
export function formatDiceRoll(result: DiceRoll): string {
  const { die, roll, max, tier, event, snapshot } = result;

  const critLabel = result.isNat20
    ? " ✨ NATURAL " + max + "!"
    : result.isCrit
    ? " 💀 CRITICAL FAILURE!"
    : "";

  return [
    `🎲 /${die} ROLL`,
    ``,
    `   ╔═══╗`,
    `   ║ ${String(roll).padStart(2)} ║${critLabel}`,
    `   ╚═══╝`,
    ``,
    `Tier: ${tier}`,
    `${event}`,
    ``,
    `⚙ T:${snapshot.tick} E:${snapshot.energy.toFixed(0)} P:${snapshot.phase} σ:${snapshot.tension.toFixed(1)}% V:${snapshot.valence.toFixed(2)}`,
  ].join("\n");
}
