/**
 * Magellan Experience Sequencer — Public API
 *
 * PWA shell usage:
 *   import { ExperienceSequencer, URANUS_SEQUENCE } from './magellan';
 *
 *   const el = document.getElementById('experience-container')!;
 *   const sequencer = new ExperienceSequencer(el, URANUS_SEQUENCE);
 *   sequencer.start();
 *
 * Mattercraft experience usage:
 *   import { MattercraftBridge } from './magellan';
 *
 *   const bridge = MattercraftBridge.init({ experienceId: 'uranus-intro' });
 *   // When animation ends:
 *   bridge.signalComplete();
 */

export { ExperienceSequencer } from "./experience-sequencer";
export { MattercraftBridge } from "./mattercraft-bridge";
export { TransitionOverlay } from "./transition-overlay";
export { URANUS_SEQUENCE } from "./uranus-config";
export type * from "./types";
