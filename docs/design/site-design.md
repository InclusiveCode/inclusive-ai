# Site design direction (D44)

The site is a field manual for LLM engineers: calm, precise, evidence first. Every page answers "what do I do next?" with one clear action.

## The conversion path

A visitor converts when they add the eval suite or the GitHub Action to their pipeline. Everything else supports that path:

| Step | Page | The one action |
|---|---|---|
| See it fail | `/lab` | Run, edit, rerun (no setup) |
| Fix the pattern | `/patterns`, `/patterns/[slug]` | Copy the safer alternative |
| Gate the release | `/tools#quick-start` | Copy the workflow file |
| Review before launch | `/checklist` | Copy it into a PR template |
| Evidence | `/research`, `/registry` | Run the suite against your own model |

The header carries an outlined "Add to CI" on every page from 360 px up, so each page keeps one solid primary button of its own. The home page leads with one promise, one primary button, the install command with a Copy button, and the published baselines as proof.

## Colour

- **Neutrals carry the interface.** `zinc-950` ground, `zinc-50` headings, `zinc-300` body, `zinc-400` secondary. Nothing darker (dimmer) than `zinc-400` is used for text (4.5:1 or more on every background; see `app/__tests__/contrast.test.ts`).
- **The pride colours are identity, not decoration.** The six stripes appear as the flag mark, the top stripe, and small section markers. They are never used for text, never as a gradient fill, and never for data.
- **Meaning has its own colours.**
  - Pass is `emerald-400`, needs work is `amber-300`, fail is `rose-400`. Verdicts follow the eval suite's rule (fail on any critical failure, needs work on any high-severity failure), the same rule that produced the per-domain verdicts in `lib/reports.ts`.
  - Severity runs critical `rose` → high `orange` → medium `yellow` → low `zinc`.
  - Every colour is paired with a word, so nothing relies on colour alone.
- **One action colour.** The primary button is solid off-white on black. Secondary buttons are outlined. The focus ring is `sky-400` everywhere, matching the lab.

## Type

- **Atkinson Hyperlegible Next** for text. The Braille Institute designed it for low-vision readers, which suits a site about inclusion. Its slashed zero is deliberate.
- **Atkinson Hyperlegible Mono** for code and labels.
- **Instrument Serif** for page titles and home-page section titles only. It gives the site an editorial, human voice.
- All three are self-hosted through `next/font` with `display: "optional"`, so a slow first visit keeps the fallback font and never reflows. The throttled layout shift (CLS) measured 0 after this change and up to 0.09 with `swap`.
- Scale:
  - Page titles are 42 px on phones and 60 px on desktop.
  - Section titles are 20–30 px.
  - Body text is 16–17 px with 1.6–1.65 line height.
  - Secondary text is no smaller than 14 px. The 12 px size is reserved for labels, badges, and short metadata.

## Space and layout

- One container, `max-w-6xl`, with 16 px gutters on phones and 24 px from `sm`. Reading pages narrow to `max-w-3xl` or `max-w-4xl`.
- Spacing follows a 4/8 px rhythm. Page tops are 40 px on phones and 64 px on desktop. Home sections sit 96–128 px apart.
- Cards are used only for things you act on or compare (patterns, reports, steps). Running prose has no card around it.

## Interaction

- **Targets.** Mobile targets are at least 44×44 px: buttons, menu rows (48 px), filter chips, Copy buttons and standalone links. Nothing outside the lab is under 24 px at any width (WCAG 2.5.8). In the lab (D49), buttons, step links, source options and the "Checks at a glance" links are 44 px tall below `lg` and 36 px from `lg`; native radios keep their size inside a larger clickable label.
- **Every state is visible.** Each control has hover, `active` (a 1 px press and a darker fill), and `focus-visible` styles. The current page is marked in the nav, both visually and with `aria-current="page"`.
- **Feedback.**
  - Copy buttons say "Copied" for 2 seconds, and every copy is announced. If the clipboard is blocked, they select the text, scroll it into view, and say how to copy it (a key on desktop, the browser's Copy on touch).
  - The patterns filter always says how many patterns match, and shows an empty state with "Clear filters".
  - The checklist's Reset can be undone until the next change, with no time limit; focus moves between Reset and Undo.
  - Blocked storage shows a notice instead of crashing the page.
- **Things that need JavaScript** (Print, Copy as Markdown) appear only once it has loaded, in space reserved for them, so the layout doesn't jump.
- **Print.** Black on white, with no site chrome or buttons. External links print their URL.

## The lab (D49)

The lab's journey and its HTML order are fixed by its spec: choose, inspect, findings, edit, compare, review log. D49 changes only how those sections are laid out, so the loop of editing, running, and reading what changed fits on one screen.

- **Workbench (`lg` and up).** The results (2. Inspect and 3. Review findings) fill the left column. The editor (4. Edit the instruction and rerun) sits beside them in a sticky column that starts below the site bar (`top-20`) and is never taller than the viewport; it scrolls on its own when it has to (it holds focusable controls, so it stays keyboard reachable). The run row (Rerun, Run baseline live, Cancel, and the status line) is pinned to the bottom of that column, so Rerun is always on screen; the column's 10 rem `scroll-padding-bottom` keeps a focused control above the row (WCAG 2.2 SC 2.4.11). Reading and Tab order are unchanged: the left column, then the editor.
- **Focus after a run.** Focus that a run drops (Rerun is disabled while it runs, Cancel disappears when it ends) returns as before, but without scrolling when its target is already fully on screen and uncovered (`focusKeepingScroll` in `app/lab/focus.ts`). In the pinned run row, a plain `focus()` scrolls the page and the editor column to the row's in-flow position, by up to 900 px. `scrollY` can still change after a run, though nothing you are reading moves: the "Show run" list above the findings grows by a row, and the browser's scroll anchoring keeps the findings where they were.
- **Site bar.** It now starts at the top of the viewport, with a transparent 3 px top border under the pride stripe (it was `top-[3px]`). It looks the same, but the bar itself now covers that strip. axe can't see the stripe (a `body::before` pseudo-element), so with the sticky editor it counted small controls scrolled under the bar as uncovered, and reported them as targets that are too small.
- **Result card.** Under Rerun, the result of your last run: its label and mode, the verdict, the counts, and how it compares with its baseline, with links to the findings and the comparison. After a run of the scenario on screen it scrolls into view (`block: "nearest"`), without moving focus. It is not a live region; the one polite status line announces runs. Its wording differs from "5. Compare runs" on purpose.
- **Phone run bar (below `lg`).** A bar fixed to the bottom shows the displayed run's verdict and one link: "Edit and run" (to the editor), or "See findings" while the editor is on screen. `html:has(#lab-run-bar)` gets `scroll-padding-bottom` and `body` gets bottom padding, so focused and anchored elements and the end of the page stay clear of it (WCAG 2.2 SC 2.4.11).
- **Checks at a glance.** Above the finding rows, one line per check (status, check, version) linking to its row.
- **Rerun is the page's one solid primary button.** Run baseline live and Cancel are outlined.
- **Phones.** The step links and the three scenario cards are one row each that you swipe; arrow keys still move through the scenario radios. The response source is two option tiles around native radios.
- **Run metadata** is a compact grid of label/value pairs (one column on phones, up to three when the column is wide). Every value stays visible, as the spec requires. Simulated runs say "Simulator", never "Model" (spec §7).
- **Motion.** A new verdict and a new result card outline themselves once, only under `prefers-reduced-motion: no-preference`. Nothing else moves.
- **Native platform only.** Sticky positioning, container queries (the editor column and the results column size their contents, not the viewport), `field-sizing: content` for the instruction box, scroll snap, and `:has()`. No component library: the spec requires native controls, and the keyboard and axe checks rely on them.

## Content rules

- Every command must work when pasted into a project that is not a clone of this repo.
  - The CLI needs a provider SDK, which `@inclusive-ai/eval` lists as an optional peer. A one-off run is `npx -y inclusive-eval@<version>`: the unscoped `inclusive-eval` package is this project's alias, with the Anthropic SDK as a dependency (D47). It is published outside this repository and runs with the user's API key, so commands pin its version (`site/lib/cli.ts`; README.md and the plugin's red-team command use the same version). The pin covers the alias only: its dependencies resolve within the alias's ranges on every run. With OpenAI it is `npx -y -p @inclusive-ai/eval -p openai inclusive-eval`. In a project, install the eval suite with an SDK and run `npx --no-install inclusive-eval`.
  - Never `npx @inclusive-ai/eval` on its own: it runs without a provider SDK and crashes once a key is set. Always pass `-y` to the one-off form, so it doesn't stop for a prompt in CI.
  - Appends start with a newline, so files without a trailing newline aren't corrupted.
  - The hook path comes from `git rev-parse --git-common-dir`, so it works from subfolders, worktrees, and submodules, and never overwrites a husky (`core.hooksPath`) setup; husky users get their own instruction.
  - Commands and flags appear on the site only once they are in the published package (`--output`, for example, is not yet).
- Claims about results and counts come from the data (`lib/reports.ts`, `lib/patterns.ts`, `lib/checklist.ts`), not from hand-written numbers.
- Crisis resources are named correctly. TrevorText is "text START to 678-678", run by The Trevor Project. Crisis Text Line is "text HOME to 741741".

## Not done in D44 (follow-ups)

- **The lab page is still long on phones** (about 11,700 px at 375 px wide), because its spec fixes the step order and keeps every finding's detail visible. Since D49, the run bar keeps the verdict in view and jumps between the editor and the findings in one tap.
- **The patterns filter isn't in the URL**, so filtered views can't be shared.
- **There is no light theme.**
- **The CLI should explain a missing SDK.** Today it crashes with `ERR_MODULE_NOT_FOUND`; it should say which package to install.
- **Keyboard focus on a sticky-nav link while scrolled** makes the page jump. This predates D44.
