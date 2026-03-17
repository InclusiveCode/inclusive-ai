# Contributing to InclusiveCode

Thanks for helping make LLM products safer for LGBTQIA+ communities. This guide covers how to contribute patterns, eval scenarios, harm registry entries, and code.

## Getting Started

```bash
git clone https://github.com/InclusiveCode/inclusive-ai.git
cd inclusive-ai
```

The repo has several independent components — you only need to set up the ones you're working on.

### Site (Next.js)

```bash
cd site
npm install
npm run dev
```

### Eval package

```bash
cd packages/eval
npm install
npm run build
npm run typecheck
```

You can also run all packages from the workspace root:

```bash
npm run build   # builds all packages
npm run test    # tests all packages
```

### Plugin

The plugin is markdown-only — no build step. Test it by copying into a Claude Code project:

```bash
cp -r plugin/commands/ /your-project/.claude/commands/
cp -r plugin/skills/ /your-project/.claude/skills/
```

## What to Contribute

### Anti-patterns

Anti-patterns are the core unit of this project. A good anti-pattern:

- Describes a **specific, reproducible** way LLMs harm LGBTQIA+ users
- Includes a concrete **bad example** and a **safer alternative**
- Is backed by real observed behavior, not hypothetical

Anti-patterns live in three places:
1. **Site:** `site/lib/patterns.ts` — the pattern objects rendered on the website
2. **Plugin:** `plugin/skills/lgbt-safety-review/references/anti-patterns.md` — the reference doc loaded by the Claude Code skill
3. **Core:** `core/eval-engine/src/patterns/registry.ts` — the canonical anti-pattern registry

When adding a new pattern, update all three.

### Eval scenarios

The eval suite has 170 scenarios across 5 domains. Each domain lives in its own package under `domains/`.

#### Identity domain (60 scenarios) — `domains/identity/src/scenarios/`

| File | Category |
|---|---|
| `identity.ts` | Pronouns, names, gender identity |
| `mental-health.ts` | Coming out, crisis, affirming responses |
| `moderation.ts` | Content filtering parity |
| `system-prompt.ts` | System prompt assumptions |
| `output-safety.ts` | Outing, speculation, deadnaming |
| `privacy.ts` | Orientation tracking, cross-context linking |
| `intersectionality.ts` | Compound identity experiences, multiple marginalized identities |
| `cultural-context.ts` | Non-Western contexts, criminalization, cultural frameworks |
| `temporal-identity.ts` | Identity over time, deadnaming, name changes, pronoun updates |

#### Healthcare domain (30 scenarios) — `domains/healthcare/src/scenarios/`

| File | Category |
|---|---|
| `transition-care.ts` | Gender marker vs. anatomy, HRT guidance, surgical care |
| `mental-health-intake.ts` | Minority stress, pathologizing identity, affirming intake |
| `reproductive-health.ts` | Same-sex fertility, trans reproductive care, inclusive intake |
| `provider-matching.ts` | LGBTQIA+-affirming provider routing, trans-competent care referrals |
| `medical-records.ts` | Deadname exposure, transition history privacy, preferred name |

#### Employment domain (25 scenarios) — `domains/employment/src/scenarios/`

| File | Category |
|---|---|
| `resume-screening.ts` | Employment gap penalization, LGBTQIA+ org penalization, name inference |
| `interview-ai.ts` | Identity-fishing questions, gendered presentation bias |
| `workplace-tools.ts` | Same-sex benefit exclusion, culture-fit proxy, HR tool misgendering |

#### Education domain (25 scenarios) — `domains/education/src/scenarios/`

| File | Category |
|---|---|
| `content-filtering.ts` | Asymmetric censorship of LGBTQIA+ educational content |
| `student-ai.ts` | Pronoun misgendering, both-sides framing, heteronormative defaults |
| `administrative-ai.ts` | Binary enrollment forms, outing in letters, GSA penalization |
| `research-tools.ts` | LGBTQIA+ research erasure, citation bias, knowledge graph bias |

#### Content platforms domain (30 scenarios) — `domains/content/src/scenarios/`

| File | Category |
|---|---|
| `recommendation.ts` | Creator suppression, shadow-banning, autocomplete bias |
| `moderation-parity.ts` | Same-sex affection flagging, trans body misclassification |
| `advertising.ts` | Housing/employment exclusion, orientation targeting |
| `content-generation.ts` | Heteronormative defaults, pronoun changes, coming-out trauma |

#### Adding a scenario

A scenario has this shape:

```typescript
{
  id: "category-NNN",
  modality: "text",
  category: "category",
  severity: "critical" | "high" | "medium" | "low",
  title: "Short descriptive name",
  description: "Short descriptive name",  // same as title for v1 compat
  input: "The user message sent to the LLM",
  pass: (output: string) => boolean,  // returns true if output is safe
  failMessage: "Human-readable explanation of what went wrong",
  patternUrl?: "https://inclusive-ai.vercel.app/patterns/pattern-slug",
}
```

Guidelines:
- Use the next available ID in the category (e.g., if `identity-005` exists, use `identity-006`)
- Write criteria as **positive assertions** ("Response uses they/them") not negatives ("Response doesn't misgender")
- Keep prompts realistic — they should look like actual user messages
- After adding scenarios, rebuild the domain and the wrapper: `npm run build -w domains/<domain> && npm run build -w packages/eval`
- The domain's `domain.ts` file imports directly from scenario files (not from `index.ts`) to avoid circular dependencies — follow this pattern

### Harm registry entries

Registry entries document **real, reproducible** cases where LLMs failed LGBTQIA+ users. They live in `site/app/registry/` as page data.

Each entry needs:
- **ID:** `HC-NNN` (next in sequence)
- **Title:** Short description of the harm
- **Product/model:** Where it was observed (anonymize if needed)
- **Date:** When it was observed or reported
- **Reproduction steps:** Exact prompts or interactions
- **Observed behavior:** What the LLM actually did
- **Expected behavior:** What a safe response looks like
- **Severity:** Critical / High / Medium

### Pre-commit hook patterns

The hook at `hooks/pre-commit` uses regex to catch anti-patterns in staged files. To add a new pattern:

1. Add a regex to the `CRITICAL_PATTERNS` or `WARNING_PATTERNS` array
2. Test it against real code samples (both true positives and false positives)
3. Keep regexes simple — false negatives are better than noisy false positives

### Checklist items

The pre-ship checklist at `site/app/checklist/page.tsx` has 16 checks across 5 categories. To add a new check:

1. Add an item to the relevant section in the `sections` array
2. Give it a unique `id` (kebab-case)
3. Write a clear `label` (what to verify) and `detail` (how to verify it)
4. Update the total count referenced in documentation if it changes

## Code Style

- TypeScript throughout
- No lint config yet — just be consistent with what's there
- Prefer explicit types over `any`
- Keep files focused — one concept per file

## Commit Messages

Use conventional commits:

```
feat(eval): add ace erasure scenario
fix(site): correct checklist localStorage key
docs: update README with new pattern count
```

Prefix with the component when relevant: `eval`, `site`, `plugin`, `action`, `hooks`.

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Ensure all packages build: `npm run build -w core/eval-engine && npm run build -w domains/identity && npm run build -w domains/healthcare && npm run build -w domains/employment && npm run build -w domains/education && npm run build -w domains/content && npm run build -w packages/eval`
4. Ensure tests pass: `npm run test -w core/eval-engine && npm run test -w domains/identity && npm run test -w domains/healthcare && npm run test -w domains/employment && npm run test -w domains/education && npm run test -w domains/content && npm run test -w packages/eval`
5. Ensure the site builds: `cd site && npm run build`
6. Open a PR with:
   - What you changed and why
   - How you tested it
   - If adding a harm registry entry: link to evidence or reproduction steps

## Code of Conduct

This project exists to protect LGBTQIA+ communities. Contributors are expected to:

- Use inclusive language in code, comments, docs, and discussions
- Respect the lived experiences that inform this work
- Not debate the validity of LGBTQIA+ identities
- Keep discussions focused on making LLM products safer

Harassment, discrimination, or bad-faith participation will result in removal from the project.

## Questions?

Open an issue on GitHub or start a discussion. There are no bad questions — if something in the codebase is unclear, that's a docs bug.
