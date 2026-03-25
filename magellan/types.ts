/**
 * Magellan Experience Sequencer — Shared Types
 *
 * Defines the contract between the Magellan PWA shell and individual
 * Mattercraft experiences. Used by both the sequencer (PWA-side) and
 * the bridge (Mattercraft-side).
 */

// ---------------------------------------------------------------------------
// Experience configuration
// ---------------------------------------------------------------------------

export interface ExperienceConfig {
  /** Unique identifier matching the Mattercraft project / scene name */
  id: string;

  /** Human-readable label (shown in replay UI) */
  label: string;

  /** Path or URL to the Mattercraft experience within the PWA */
  src: string;

  /**
   * How the experience signals completion:
   * - "timeline"  → the Mattercraft animation timeline ends
   * - "message"   → the experience posts a `experience:complete` message
   * - "both"      → whichever fires first
   */
  completionTrigger: "timeline" | "message" | "both";

  /** Duration in ms — used as a fallback timeout if no completion signal arrives */
  timeoutMs?: number;

  /** Optional thumbnail URL for the replay selector */
  thumbnail?: string;
}

export interface SequenceConfig {
  /** Ordered list of experiences in this journey */
  experiences: ExperienceConfig[];

  /** localStorage key used to persist progress */
  storageKey: string;

  /**
   * Strategy when all experiences have been played:
   * - "replay-menu" → show a menu letting the user pick any experience
   * - "loop"        → restart from the first experience
   */
  onSequenceComplete: "replay-menu" | "loop";
}

// ---------------------------------------------------------------------------
// PostMessage protocol
// ---------------------------------------------------------------------------

/**
 * Messages sent FROM a Mattercraft experience TO the PWA shell.
 */
export type BridgeToShellMessage =
  | { type: "experience:ready"; experienceId: string }
  | { type: "experience:complete"; experienceId: string }
  | { type: "experience:error"; experienceId: string; error: string };

/**
 * Messages sent FROM the PWA shell TO a Mattercraft experience.
 */
export type ShellToBridgeMessage =
  | { type: "shell:start"; experienceId: string }
  | { type: "shell:pause"; experienceId: string }
  | { type: "shell:resume"; experienceId: string };

// ---------------------------------------------------------------------------
// Sequencer state
// ---------------------------------------------------------------------------

export interface SequencerState {
  /** IDs of experiences that have been completed at least once */
  completed: string[];

  /** The experience currently active (null = none playing) */
  currentId: string | null;

  /** Index in the sequence for the current run-through */
  currentIndex: number;
}
