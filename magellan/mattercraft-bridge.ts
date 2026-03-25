/**
 * Mattercraft Bridge
 *
 * Drop this into EACH Mattercraft experience project. It handles
 * communication with the Magellan PWA shell's Experience Sequencer.
 *
 * Integration steps for each Mattercraft experience:
 *
 *   1. Import this file into your Mattercraft project's main script
 *   2. Call `MattercraftBridge.init()` with your experience ID
 *   3. When your animation timeline ends, call `bridge.signalComplete()`
 *      — OR let the bridge auto-detect timeline completion (see below)
 *
 * Example — manual signal (e.g. from a button press or custom event):
 *
 *   const bridge = MattercraftBridge.init({ experienceId: 'uranus-intro' });
 *
 *   // When your animation/interaction is done:
 *   bridge.signalComplete();
 *
 * Example — auto-detect timeline end in Mattercraft:
 *
 *   const bridge = MattercraftBridge.init({
 *     experienceId: 'uranus-intro',
 *     autoDetectTimeline: true,       // hooks into Mattercraft's timeline
 *     timelineElement: myTimelineNode, // the Mattercraft node with the timeline
 *   });
 */

import type { BridgeToShellMessage, ShellToBridgeMessage } from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface BridgeConfig {
  /** Must match the `id` in the SequenceConfig on the PWA side */
  experienceId: string;

  /**
   * If true, the bridge will attempt to hook into Mattercraft's
   * timeline system to auto-signal completion.
   */
  autoDetectTimeline?: boolean;

  /**
   * The Mattercraft scene node whose timeline should be observed.
   * Required when `autoDetectTimeline` is true.
   *
   * In Mattercraft this is typically the root group or the node
   * that holds your main animation timeline.
   */
  timelineElement?: any;
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export class MattercraftBridge {
  private experienceId: string;
  private completed = false;

  private constructor(config: BridgeConfig) {
    this.experienceId = config.experienceId;

    // Listen for messages from the shell
    window.addEventListener("message", this.onShellMessage);

    // Auto-detect timeline completion if requested
    if (config.autoDetectTimeline && config.timelineElement) {
      this.observeTimeline(config.timelineElement);
    }

    // Tell the shell we're ready
    this.postToShell({ type: "experience:ready", experienceId: this.experienceId });
  }

  /** Factory — use this to create the bridge. */
  static init(config: BridgeConfig): MattercraftBridge {
    return new MattercraftBridge(config);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Call this when the experience is done — e.g. from an "end" button,
   * the last frame of an animation, or any custom trigger.
   */
  signalComplete(): void {
    if (this.completed) return;
    this.completed = true;

    this.postToShell({
      type: "experience:complete",
      experienceId: this.experienceId,
    });
  }

  /**
   * Call this if something goes wrong and the experience can't continue.
   * The sequencer will skip to the next experience.
   */
  signalError(error: string): void {
    this.postToShell({
      type: "experience:error",
      experienceId: this.experienceId,
      error,
    });
  }

  // -----------------------------------------------------------------------
  // Timeline auto-detection
  // -----------------------------------------------------------------------

  /**
   * Hooks into Mattercraft's timeline system.
   *
   * Mattercraft nodes with timelines expose an `animation` or `timeline`
   * property. We listen for the "finish" event on the underlying
   * Web Animations API animation, or poll `currentTime` vs `duration`
   * as a fallback.
   *
   * Adapt the property names below to match your Mattercraft SDK version.
   */
  private observeTimeline(timelineNode: any): void {
    // --- Strategy 1: Web Animations API (preferred) ---
    // Mattercraft often wraps timelines as Web Animation objects.
    const animation =
      timelineNode.animation ?? timelineNode.timeline ?? timelineNode._animation;

    if (animation && typeof animation.finished?.then === "function") {
      animation.finished.then(() => this.signalComplete());
      return;
    }

    if (animation && typeof animation.addEventListener === "function") {
      animation.addEventListener("finish", () => this.signalComplete());
      return;
    }

    // --- Strategy 2: Mattercraft onComplete callback ---
    // Some Mattercraft timeline nodes expose an `onComplete` hook.
    if (typeof timelineNode.onComplete === "function" || timelineNode.onComplete === undefined) {
      const original = timelineNode.onComplete;
      timelineNode.onComplete = () => {
        original?.();
        this.signalComplete();
      };
      return;
    }

    // --- Strategy 3: Poll currentTime vs duration ---
    // Last resort: check every 500ms if the timeline has finished.
    if (typeof timelineNode.duration === "number") {
      const poll = setInterval(() => {
        const current = timelineNode.currentTime ?? 0;
        if (current >= timelineNode.duration) {
          clearInterval(poll);
          this.signalComplete();
        }
      }, 500);
      return;
    }

    console.warn(
      `[MattercraftBridge] Could not auto-detect timeline for "${this.experienceId}". ` +
        "Call bridge.signalComplete() manually when the experience ends.",
    );
  }

  // -----------------------------------------------------------------------
  // Shell communication
  // -----------------------------------------------------------------------

  private onShellMessage = (event: MessageEvent): void => {
    const data = event.data as ShellToBridgeMessage;
    if (!data || typeof data.type !== "string") return;
    if (data.experienceId !== this.experienceId) return;

    switch (data.type) {
      case "shell:start":
        // The shell says "go" — start your timeline / interaction.
        // Mattercraft experiences typically auto-play, so this is
        // informational. Override if you need gated starts.
        break;

      case "shell:pause":
        // Optional: pause the Mattercraft timeline
        break;

      case "shell:resume":
        // Optional: resume the Mattercraft timeline
        break;
    }
  };

  private postToShell(message: BridgeToShellMessage): void {
    // Post to parent — works whether embedded via iframe or same window
    const target = window.parent !== window ? window.parent : window;
    target.postMessage(message, "*");
  }
}
