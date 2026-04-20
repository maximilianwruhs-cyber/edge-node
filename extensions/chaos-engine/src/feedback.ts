/**
 * GZMO Chaos Engine — Feedback Channel
 *
 * Adapted from feedback.rs for Edge-Node context.
 * Defines ChaosEvent types that flow from agent interactions
 * back into the chaos engine, creating the autopoietic loop:
 *   outputs → modify system → generate different outputs
 *
 * Original GZMO events (Dice, Sound, Card, Poem...) are replaced
 * with Edge-Node equivalents (Interaction, ToolCall, Heartbeat...).
 */

// ── ChaosEvent ─────────────────────────────────────────────────────

export type ChaosEvent =
  | { type: "interaction_completed"; tokenCount: number; durationMs: number }
  | { type: "tool_executed"; toolName: string; success: boolean }
  | { type: "heartbeat_fired"; energy: number }
  | { type: "telegram_received"; messageLength: number }
  | { type: "wiki_updated"; pageTitle: string }
  | { type: "dream_proposed"; dreamText: string }
  | { type: "session_started" }
  | { type: "session_ended"; totalTurns: number }
  | { type: "error_occurred"; errorType: string }
  | { type: "custom"; tensionDelta: number; energyDelta: number; thoughtSeed?: ThoughtSeed };

// ── Thought Seed ───────────────────────────────────────────────────

export interface ThoughtSeed {
  category: string;
  text: string;
}

// ── Event → Tension/Energy/Thought mappings ────────────────────────

export function tensionDelta(event: ChaosEvent): number {
  switch (event.type) {
    case "interaction_completed":
      // Long generations increase tension, short ones decrease
      return event.tokenCount > 300 ? 2.0 : -1.0;
    case "tool_executed":
      return event.success ? -1.0 : 3.0; // Failures are stressful
    case "heartbeat_fired":
      return -0.5; // Routine is calming
    case "telegram_received":
      // Longer messages = more tension
      return Math.min(event.messageLength / 100, 5.0);
    case "wiki_updated":
      return -2.0; // Knowledge consolidation is calming
    case "dream_proposed":
      return 5.0; // Identity proposals are intense
    case "session_started":
      return 3.0; // New sessions spike tension
    case "session_ended":
      return -3.0; // Session end is relief
    case "error_occurred":
      return 8.0; // Errors are very stressful
    case "custom":
      return event.tensionDelta;
  }
}

export function energyDelta(event: ChaosEvent): number {
  switch (event.type) {
    case "interaction_completed":
      return -(event.durationMs / 5000); // Longer calls drain more
    case "tool_executed":
      return event.success ? -1.0 : -3.0; // Failures cost more
    case "heartbeat_fired":
      return -0.5;
    case "telegram_received":
      return 5.0; // External input energizes (like inbox_drop)
    case "wiki_updated":
      return -2.0; // Writing costs energy
    case "dream_proposed":
      return -5.0; // Dreams are expensive
    case "session_started":
      return 0;
    case "session_ended":
      return 0;
    case "error_occurred":
      return -5.0;
    case "custom":
      return event.energyDelta;
  }
}

export function thoughtSeed(event: ChaosEvent): ThoughtSeed | null {
  switch (event.type) {
    case "interaction_completed":
      return event.tokenCount > 200
        ? { category: "interaction", text: `Generated ${event.tokenCount} tokens in ${event.durationMs}ms` }
        : null;
    case "tool_executed":
      return event.success
        ? { category: "tool_use", text: `Successfully executed ${event.toolName}` }
        : null;
    case "heartbeat_fired":
      return { category: "heartbeat", text: `Heartbeat at energy ${event.energy.toFixed(0)}%` };
    case "wiki_updated":
      return { category: "wiki_edit", text: `Updated: ${event.pageTitle}` };
    case "dream_proposed":
      return { category: "dream", text: event.dreamText };
    case "telegram_received":
      return event.messageLength > 50
        ? { category: "interaction", text: `Received ${event.messageLength}-char message` }
        : null;
    case "custom":
      return event.thoughtSeed ?? null;
    default:
      return null;
  }
}
