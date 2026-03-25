/**
 * Magellan Experience Sequencer
 *
 * Drop this into the Magellan PWA shell. It manages:
 *   1. Loading Mattercraft experiences in order
 *   2. Listening for completion signals (timeline end / postMessage)
 *   3. Auto-advancing to the next experience
 *   4. Persisting progress so users can resume or replay
 *   5. Rendering a replay menu once all experiences are done
 *
 * Usage:
 *   import { ExperienceSequencer } from './experience-sequencer';
 *   import { URANUS_SEQUENCE } from './uranus-config';
 *
 *   const sequencer = new ExperienceSequencer(
 *     document.getElementById('experience-container')!,
 *     URANUS_SEQUENCE,
 *   );
 *   sequencer.start();
 */

import type {
  SequenceConfig,
  SequencerState,
  ExperienceConfig,
  BridgeToShellMessage,
} from "./types";
import { TransitionOverlay } from "./transition-overlay";

// ---------------------------------------------------------------------------
// Sequencer
// ---------------------------------------------------------------------------

export class ExperienceSequencer {
  private container: HTMLElement;
  private config: SequenceConfig;
  private state: SequencerState;
  private transition: TransitionOverlay;
  private iframe: HTMLIFrameElement | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement, config: SequenceConfig) {
    this.container = container;
    this.config = config;
    this.state = this.loadState();
    this.transition = new TransitionOverlay(container);

    // Listen for postMessage from Mattercraft experiences
    window.addEventListener("message", this.onMessage);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Kick off the sequence (or resume where the user left off). */
  start(): void {
    const allCompleted = this.config.experiences.every((exp) =>
      this.state.completed.includes(exp.id),
    );

    if (allCompleted && this.config.onSequenceComplete === "replay-menu") {
      this.showReplayMenu();
    } else {
      // Resume from where we left off
      this.loadExperience(this.state.currentIndex);
    }
  }

  /** Jump to a specific experience by ID (used by replay menu). */
  playExperience(id: string): void {
    const index = this.config.experiences.findIndex((e) => e.id === id);
    if (index === -1) {
      console.warn(`[Sequencer] Unknown experience: ${id}`);
      return;
    }
    this.hideReplayMenu();
    this.loadExperience(index);
  }

  /** Clean up listeners. */
  destroy(): void {
    window.removeEventListener("message", this.onMessage);
    this.clearTimeout();
  }

  // -------------------------------------------------------------------------
  // Experience lifecycle
  // -------------------------------------------------------------------------

  private async loadExperience(index: number): Promise<void> {
    const experience = this.config.experiences[index];
    if (!experience) {
      this.onSequenceEnd();
      return;
    }

    // Update state
    this.state.currentIndex = index;
    this.state.currentId = experience.id;
    this.saveState();

    // Transition out the old experience
    await this.transition.fadeOut();

    // Tear down previous iframe
    this.removeIframe();

    // Create new iframe for the Mattercraft experience
    this.iframe = document.createElement("iframe");
    this.iframe.src = experience.src;
    this.iframe.className = "magellan-experience-frame";
    this.iframe.allow = "camera; microphone; gyroscope; accelerometer; xr-spatial-tracking";
    this.iframe.setAttribute("allowfullscreen", "");
    Object.assign(this.iframe.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      border: "none",
    });
    this.container.appendChild(this.iframe);

    // Set up fallback timeout
    if (experience.timeoutMs) {
      this.timeoutHandle = setTimeout(() => {
        console.warn(
          `[Sequencer] Experience "${experience.id}" timed out after ${experience.timeoutMs}ms`,
        );
        this.onExperienceComplete(experience.id);
      }, experience.timeoutMs);
    }

    // Fade in
    await this.transition.fadeIn();
  }

  private onExperienceComplete(experienceId: string): void {
    // Guard: only handle if this is the current experience
    if (experienceId !== this.state.currentId) return;

    this.clearTimeout();

    // Mark completed
    if (!this.state.completed.includes(experienceId)) {
      this.state.completed.push(experienceId);
    }

    // Advance to next
    const nextIndex = this.state.currentIndex + 1;

    if (nextIndex < this.config.experiences.length) {
      this.loadExperience(nextIndex);
    } else {
      this.onSequenceEnd();
    }
  }

  private onSequenceEnd(): void {
    this.state.currentId = null;
    this.saveState();

    if (this.config.onSequenceComplete === "replay-menu") {
      this.showReplayMenu();
    } else {
      // Loop back to start
      this.state.currentIndex = 0;
      this.saveState();
      this.loadExperience(0);
    }
  }

  // -------------------------------------------------------------------------
  // PostMessage handler
  // -------------------------------------------------------------------------

  private onMessage = (event: MessageEvent): void => {
    const data = event.data as BridgeToShellMessage;
    if (!data || typeof data.type !== "string") return;

    switch (data.type) {
      case "experience:ready":
        // Tell the experience to start playing
        this.iframe?.contentWindow?.postMessage(
          { type: "shell:start", experienceId: data.experienceId },
          "*",
        );
        break;

      case "experience:complete":
        this.onExperienceComplete(data.experienceId);
        break;

      case "experience:error":
        console.error(
          `[Sequencer] Experience "${data.experienceId}" error:`,
          data.error,
        );
        // Skip to next on error
        this.onExperienceComplete(data.experienceId);
        break;
    }
  };

  // -------------------------------------------------------------------------
  // Replay menu
  // -------------------------------------------------------------------------

  private showReplayMenu(): void {
    this.removeIframe();

    const menu = document.createElement("div");
    menu.id = "magellan-replay-menu";
    Object.assign(menu.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      background: "rgba(0, 0, 0, 0.85)",
      color: "#fff",
      fontFamily: "system-ui, sans-serif",
      padding: "24px",
    });

    const title = document.createElement("h2");
    title.textContent = "Replay an Experience";
    title.style.marginBottom = "12px";
    menu.appendChild(title);

    for (const exp of this.config.experiences) {
      const btn = document.createElement("button");
      btn.textContent = exp.label;
      Object.assign(btn.style, {
        padding: "14px 28px",
        fontSize: "16px",
        borderRadius: "8px",
        border: "2px solid #fff",
        background: "transparent",
        color: "#fff",
        cursor: "pointer",
        minWidth: "200px",
        transition: "background 0.2s, color 0.2s",
      });
      btn.addEventListener("pointerenter", () => {
        btn.style.background = "#fff";
        btn.style.color = "#000";
      });
      btn.addEventListener("pointerleave", () => {
        btn.style.background = "transparent";
        btn.style.color = "#fff";
      });
      btn.addEventListener("click", () => this.playExperience(exp.id));
      menu.appendChild(btn);
    }

    // "Play All" button to restart the full sequence
    const playAll = document.createElement("button");
    playAll.textContent = "▶ Play All Again";
    Object.assign(playAll.style, {
      marginTop: "16px",
      padding: "14px 28px",
      fontSize: "16px",
      fontWeight: "bold",
      borderRadius: "8px",
      border: "none",
      background: "#fff",
      color: "#000",
      cursor: "pointer",
      minWidth: "200px",
    });
    playAll.addEventListener("click", () => {
      this.state.completed = [];
      this.state.currentIndex = 0;
      this.saveState();
      this.hideReplayMenu();
      this.loadExperience(0);
    });
    menu.appendChild(playAll);

    this.container.appendChild(menu);
  }

  private hideReplayMenu(): void {
    const menu = this.container.querySelector("#magellan-replay-menu");
    menu?.remove();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private removeIframe(): void {
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
  }

  private clearTimeout(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private loadState(): SequencerState {
    try {
      const raw = localStorage.getItem(this.config.storageKey);
      if (raw) return JSON.parse(raw);
    } catch {
      // Corrupted state — start fresh
    }
    return { completed: [], currentId: null, currentIndex: 0 };
  }

  private saveState(): void {
    localStorage.setItem(this.config.storageKey, JSON.stringify(this.state));
  }
}
