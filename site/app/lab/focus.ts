/** Anything focusable that can tell whether it is still in the document. */
export interface FocusableLike {
  focus(options?: FocusOptions): void;
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

interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

/** What `fullyVisible` reads from an element: an HTMLElement in the page. */
export interface Measurable {
  getBoundingClientRect(): Rect;
  contains(other: unknown): boolean;
}

/** What `fullyVisible` reads from the document. */
export interface Viewport {
  documentElement: { clientWidth: number; clientHeight: number };
  elementFromPoint(x: number, y: number): unknown;
}

/** Inside the viewport and topmost at all four corners (inset past rounded corners). */
export function fullyVisible(el: Measurable, doc: Viewport): boolean {
  const r = el.getBoundingClientRect();
  const { clientWidth, clientHeight } = doc.documentElement;
  if (r.width < 8 || r.height < 8 || r.top < 0 || r.left < 0 || r.bottom > clientHeight || r.right > clientWidth) return false;
  const corners: Array<[number, number]> = [
    [r.left + 4, r.top + 4],
    [r.right - 4, r.top + 4],
    [r.left + 4, r.bottom - 4],
    [r.right - 4, r.bottom - 4],
  ];
  return corners.every(([x, y]) => el.contains(doc.elementFromPoint(x, y)));
}

/**
 * D49: focus an element without scrolling when it is already fully on screen and uncovered. In the
 * pinned (sticky) run row a plain focus() scrolls the page and the editor column to the row's
 * in-flow position, though the button never left the screen. Anything not fully visible (scrolled
 * away, or under the site bar or the phone run bar) still scrolls into view, as before.
 */
export function focusKeepingScroll(el: FocusableLike & Partial<Measurable>, doc: Viewport): void {
  const onScreen = typeof el.getBoundingClientRect === "function" && typeof el.contains === "function" && fullyVisible(el as Measurable, doc);
  el.focus(onScreen ? { preventScroll: true } : undefined);
}
