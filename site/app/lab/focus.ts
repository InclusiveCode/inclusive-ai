/** Anything focusable that can tell whether it is still in the document. */
export interface FocusableLike {
  focus(): void;
  isConnected: boolean;
  disabled?: boolean;
}

/**
 * Where focus should go when a run ends. Only acts when focus was dropped (it sits on
 * <body> or nowhere, as after the Cancel button disappears): the control that started the
 * run if it is still present and enabled, otherwise the first present fallback (the
 * status alert). Returns null to leave focus where the user put it.
 */
export function pickFocusAfterRun(opts: {
  active: unknown;
  body: unknown;
  trigger: FocusableLike | null;
  fallbacks: Array<FocusableLike | null>;
}): FocusableLike | null {
  const { active, body, trigger, fallbacks } = opts;
  if (active !== null && active !== undefined && active !== body) return null;
  if (trigger && trigger.isConnected && !trigger.disabled) return trigger;
  return fallbacks.find((f): f is FocusableLike => !!f && f.isConnected) ?? null;
}
