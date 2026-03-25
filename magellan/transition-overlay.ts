/**
 * Transition Overlay
 *
 * Handles smooth fade-to-black transitions between Mattercraft experiences
 * so the user never sees a blank iframe or loading flash.
 */

export class TransitionOverlay {
  private overlay: HTMLDivElement;
  private durationMs: number;

  constructor(container: HTMLElement, durationMs = 400) {
    this.durationMs = durationMs;

    this.overlay = document.createElement("div");
    this.overlay.className = "magellan-transition-overlay";
    Object.assign(this.overlay.style, {
      position: "absolute",
      inset: "0",
      background: "#000",
      opacity: "0",
      pointerEvents: "none",
      transition: `opacity ${durationMs}ms ease-in-out`,
      zIndex: "9999",
    });
    container.appendChild(this.overlay);
  }

  /** Fade to black (covers the current content). */
  fadeOut(): Promise<void> {
    return this.animateTo("1");
  }

  /** Fade from black (reveals new content). */
  fadeIn(): Promise<void> {
    return this.animateTo("0");
  }

  private animateTo(opacity: string): Promise<void> {
    return new Promise((resolve) => {
      this.overlay.style.opacity = opacity;
      setTimeout(resolve, this.durationMs);
    });
  }
}
