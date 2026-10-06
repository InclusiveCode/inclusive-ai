/**
 * A code block that may scroll sideways (most do at 320 px) is a focusable, named region
 * (WCAG 2.1.1). Keyboard users reach it with Tab and scroll it with the arrow keys, as with the
 * lab's tables. Shared by /tools (F9) and the pattern pages (F10).
 */
export function CodeBlock({
  label,
  className,
  codeClassName,
  insetFocus = false,
  children,
}: {
  /** Unique on the page, saying what the code is, e.g. "Code: install Eval Suite". */
  label: string;
  /** Layout and colours of the <pre>; it must include an overflow-x-auto class. */
  className: string;
  /** When set, the content is wrapped in <code> with these classes. */
  codeClassName?: string;
  /** Draw the focus outline inside the block, for blocks in an overflow-hidden container. */
  insetFocus?: boolean;
  children: React.ReactNode;
}) {
  const focus = `focus-visible:outline-2 focus-visible:outline-sky-400 ${insetFocus ? "focus-visible:-outline-offset-2" : "focus-visible:outline-offset-2"}`;
  return (
    <pre tabIndex={0} role="region" aria-label={label} className={`${className} ${focus}`}>
      {codeClassName ? <code className={codeClassName}>{children}</code> : children}
    </pre>
  );
}
