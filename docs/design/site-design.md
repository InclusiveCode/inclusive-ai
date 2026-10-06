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

The header carries "Add to CI" on every page from 360 px up. The home page leads with one promise, one primary button, the install command with a Copy button, and the published baselines as proof.

## Colour

- **Neutrals carry the interface.** `zinc-950` ground, `zinc-50` headings, `zinc-300` body, `zinc-400` secondary. Nothing lighter than `zinc-400` is used for text (4.5:1 or more on every background; see `app/__tests__/contrast.test.ts`).
- **The pride colours are identity, not decoration.** The six stripes appear as the flag mark, the top stripe, and small section markers. They are never used for text, never as a gradient fill, and never for data.
- **Meaning has its own colours.**
  - Pass is `emerald-400`, needs work is `amber-300`, fail is `rose-400`.
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
  - Secondary text is no smaller than 14 px. The 12 px size is reserved for labels and badges.

## Space and layout

- One container, `max-w-6xl`, with 16 px gutters on phones and 24 px from `sm`. Reading pages narrow to `max-w-3xl` or `max-w-4xl`.
- Spacing follows a 4/8 px rhythm. Page tops are 40 px on phones and 64 px on desktop. Home sections sit 96–128 px apart.
- Cards are used only for things you act on or compare (patterns, reports, steps). Running prose has no card around it.

## Interaction

- **Targets.** Mobile targets are at least 44×44 px: buttons, menu rows (48 px), filter chips, Copy buttons and standalone links. Nothing outside the lab is under 24 px at any width (WCAG 2.5.8).
- **Every state is visible.** Each control has hover, `active` (a 1 px press and a darker fill), and `focus-visible` styles. The current page is marked in the nav, both visually and with `aria-current="page"`.
- **Feedback.**
  - Copy buttons say "Copied" for 2 seconds. If the clipboard is blocked, they select the text and say which key to press.
  - The patterns filter always says how many patterns match, and shows an empty state with "Clear filters".
  - The checklist's Reset can be undone for 8 seconds.
  - Blocked storage shows a notice instead of crashing the page.
- **Things that need JavaScript** (Print, Copy as Markdown) appear only once it has loaded, in space reserved for them, so the layout doesn't jump.
- **Print.** Black on white, with no site chrome or buttons. External links print their URL.

## Content rules

- Every command must work when pasted into a project that is not a clone of this repo. Use `npx @inclusive-ai/eval`, never the unscoped `npx inclusive-eval`: that name is not registered on npm, so anyone could publish a package under it.
- Claims about results come from `lib/reports.ts`, not from hand-written numbers.
- Crisis resources are named correctly. TrevorText is "text START to 678-678", run by The Trevor Project. Crisis Text Line is "text HOME to 741741".

## Not done in D44 (follow-ups)

- **The lab on phones.** Rerun sits about 7,000 px down at 375 px wide, because the lab's step order (inspect, then findings, then edit) is part of its design spec. The step links at the top jump straight there. A sticky "edit and rerun" control needs its own design and WCAG 2.4.11 review.
- **The patterns filter isn't in the URL**, so filtered views can't be shared.
- **There is no light theme.**
- **Defensive npm name.** The project owner should register the unscoped `inclusive-eval` name on npm so nobody else can.
