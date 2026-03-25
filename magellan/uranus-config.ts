/**
 * Uranus Project — Experience Sequence Configuration
 *
 * Edit the `experiences` array below to match your Mattercraft projects.
 * The `src` should point to each experience's path within the Magellan PWA.
 *
 * Order matters — experiences play top-to-bottom on first run.
 */

import type { SequenceConfig } from "./types";

export const URANUS_SEQUENCE: SequenceConfig = {
  storageKey: "uranus-experience-progress",
  onSequenceComplete: "replay-menu",

  experiences: [
    // -----------------------------------------------------------------------
    // Replace these with your actual Mattercraft experience paths & IDs.
    // The `src` is the path the Magellan PWA uses to serve each experience.
    // -----------------------------------------------------------------------
    {
      id: "uranus-intro",
      label: "Introduction",
      src: "/experiences/uranus-intro/index.html",
      completionTrigger: "both",
      timeoutMs: 120_000, // 2 min safety timeout
    },
    {
      id: "uranus-explore",
      label: "Explore",
      src: "/experiences/uranus-explore/index.html",
      completionTrigger: "both",
      timeoutMs: 180_000,
    },
    {
      id: "uranus-finale",
      label: "Finale",
      src: "/experiences/uranus-finale/index.html",
      completionTrigger: "both",
      timeoutMs: 120_000,
    },
  ],
};
