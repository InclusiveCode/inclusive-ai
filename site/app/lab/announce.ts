/**
 * Polite-region text when a run finishes. If the user switched to another scenario while
 * the run was in flight, the announcement names the run's scenario so it is not mistaken
 * for the one on screen.
 */
export function completionAnnouncement(opts: { n: number; headline: string; scenarioTitle: string; displayed: boolean }): string {
  const { n, headline, scenarioTitle, displayed } = opts;
  return displayed ? `Run ${n} complete: ${headline}` : `Run ${n} complete for ${scenarioTitle}: ${headline}`;
}
