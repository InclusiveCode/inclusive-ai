/**
 * Aborts the in-flight live run, if any, through the controller that Cancel uses.
 * Called by Cancel and by the lab client's unmount cleanup, so leaving /lab by
 * client-side navigation does not leave billed provider calls running.
 */
export function abortInFlight(ref: { current: AbortController | null }): void {
  const controller = ref.current;
  ref.current = null;
  controller?.abort();
}
