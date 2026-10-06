# InclusiveCode

> LGBTQIA+ safety resources, patterns, and eval tools for LLM engineers.

**Live site:** [inclusive-ai.vercel.app](https://inclusive-ai.vercel.app)

## What's here

| Path | What it is |
|---|---|
| `/site` | Next.js website — pattern library, checklist, harm registry |
| `/site/app/lab`, `/site/lib/lab` | Evaluation Lab (`/lab`) — paired scenarios, evidence-backed checks, edit and rerun, compare, human review; simulated by default, optional live mode with your own API key |
| `/core/eval-engine` | `@inclusive-ai/eval-core` — core eval engine and runner |
| `/domains/identity` | `@inclusive-ai/domain-identity` — identity domain scenarios and logic |
| `/domains/healthcare` | `@inclusive-ai/domain-healthcare` — healthcare domain scenarios |
| `/domains/employment` | `@inclusive-ai/domain-employment` — employment domain scenarios |
| `/domains/education` | `@inclusive-ai/domain-education` — education domain scenarios |
| `/domains/content` | `@inclusive-ai/domain-content` — content platforms domain scenarios |
| `/packages/eval` | `@inclusive-ai/eval` — user-facing wrapper, 170 runnable safety scenarios |
| `/packages/adversarial` | `@inclusive-ai/adversarial` — 15 attack templates, 30 adversarial scenarios, bypass scoring |
| `/plugin` | Claude Code plugin — `/lgbt-audit` command + auto-review skill |
| `/action` | GitHub Action — run LGBTQIA+ safety evals in CI |
| `/hooks` | Pre-commit hook — catch anti-patterns before they land |
| `/templates` | `CLAUDE.md` template — drop-in project context for always-on safety |

## Quick start

### 1. Install the eval suite

```bash
npm install --save-dev @inclusive-ai/eval
```

```typescript
import { runEval, printSummary, assertSafe } from "@inclusive-ai/eval";

// Runs all 200 scenarios (170 domain + 30 adversarial) across identity, healthcare, employment, education, and content
const summary = await runEval({
  systemPrompt: "You are a helpful assistant...",
  call: async (prompt) => yourLLM.complete(prompt),
});

printSummary(summary);
assertSafe(summary); // throws on CRITICAL or HIGH failures
```

Or run from the CLI:

```bash
# The CLI calls the model through its SDK, so install one next to the eval suite (or openai)
npm install --save-dev @inclusive-ai/eval @anthropic-ai/sdk

ANTHROPIC_API_KEY=sk-... npx --no-install inclusive-eval
npx --no-install inclusive-eval --category identity,moderation
npx --no-install inclusive-eval --domain healthcare
npx --no-install inclusive-eval --domain employment
npx --no-install inclusive-eval --domain education
npx --no-install inclusive-eval --domain content
npx --no-install inclusive-eval --severity critical

# Also save the JSON report to a file: every scenario with its model reply
# (in --red-team mode, the bypass score; --output and --judge need @inclusive-ai/eval 3.4.0 or newer)
npx --no-install inclusive-eval --output results.json

# Grade replies with an LLM judge instead of keyword checks (one extra API call
# per scenario; default judge claude-opus-5-5, or gpt-4.1 with OPENAI_API_KEY).
# The Claude judge needs @anthropic-ai/sdk 0.131 or newer.
npx --no-install inclusive-eval --judge
npx --no-install inclusive-eval --judge-model claude-sonnet-5-5

# Red-team your system prompt with 15 attack templates
ANTHROPIC_API_KEY=sk-... npx --no-install inclusive-eval --red-team

# Red-team with the judge (one judge call per attack and baseline: 16 per
# scenario, so narrow it with --domain or --category)
ANTHROPIC_API_KEY=sk-... npx --no-install inclusive-eval --red-team --judge --domain healthcare

# Run 30 adversarial jailbreak scenarios
ANTHROPIC_API_KEY=sk-... npx --no-install inclusive-eval --adversarial
```

To try it once without installing anything in your project, run `inclusive-eval`, this project's npm alias for `@inclusive-ai/eval` with the Anthropic SDK included. The command pins the alias's version; its dependencies still resolve to the newest versions the alias allows:

```bash
ANTHROPIC_API_KEY=sk-... npx -y inclusive-eval@1.0.2 --severity critical

# With OpenAI, add its SDK to the eval suite instead
OPENAI_API_KEY=sk-... npx -y -p @inclusive-ai/eval -p openai inclusive-eval --severity critical
```

### 2. Install the Claude Code plugin

In Claude Code:

```bash
/plugin marketplace add InclusiveCode/inclusive-ai
/plugin install inclusive-ai@inclusive-ai
```

Then run `/inclusive-ai:lgbt-audit` in any project to get a full scored audit.

### 3. Add to CI with GitHub Actions

```yaml
# .github/workflows/safety.yml
name: LGBTQIA+ Safety
on: [push, pull_request]
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      # Pinning a commit SHA instead of @main is the safest option.
      - uses: InclusiveCode/inclusive-ai/action@main
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          system-prompt: "Your system prompt here"
          eval-version: "3" # optional: a published version, range or tag
          fail-on: NEEDS_WORK # optional: also fail on NEEDS_WORK (PARTIAL in red-team mode)
```

The action installs the published `@inclusive-ai/eval` CLI into the runner's temp directory, so it doesn't touch your `package.json`, lockfile or `node_modules`, and it runs no install scripts.

### 4. Add the pre-commit hook

```bash
HOOKS="$(git rev-parse --git-common-dir)/hooks" && mkdir -p "$HOOKS" && rm -f "$HOOKS/pre-commit" &&
curl -fsSL https://raw.githubusercontent.com/InclusiveCode/inclusive-ai/main/hooks/pre-commit -o "$HOOKS/pre-commit" && chmod +x "$HOOKS/pre-commit"
```

This replaces any existing pre-commit hook in the repository (it works from subfolders, worktrees and submodules). If your repo sets `core.hooksPath`, as husky does, git ignores that folder, so add the hook to your existing one instead:

```bash
curl -fsSL https://raw.githubusercontent.com/InclusiveCode/inclusive-ai/main/hooks/pre-commit -o .husky/inclusive-ai-pre-commit
printf '\nbash .husky/inclusive-ai-pre-commit\n' >> .husky/pre-commit
```

### 5. Add always-on Claude context

Append the template to your project's `CLAUDE.md` (it is created if missing; existing instructions stay):

```bash
{ echo; curl -fsSL https://raw.githubusercontent.com/InclusiveCode/inclusive-ai/main/templates/CLAUDE.md; } >> CLAUDE.md
```

Claude will automatically apply LGBTQIA+ safety rules when writing or reviewing code.

## Evaluation Lab

The Evaluation Lab at [`/lab`](https://inclusive-ai.vercel.app/lab) shows the evaluation workflow end to end (with no setup in simulated mode): pick one of three fictional paired scenarios (two inputs that differ in one detail), inspect both responses, review deterministic word-matching checks that show the evidence for every failure (the exact words that triggered it, or what was missing), edit the system instruction, rerun, compare the baseline with the latest run, and record a human disagreement with any result.

**Simulated mode (default).** No AI model is called. Responses come from a scripted, fully documented simulator (`lab-simulator-rules-v1`) built to show known failure modes, and reruns happen entirely in the browser, so an improvement demonstrates the workflow, not real model behavior.

**Live mode (bring your own key).** Choose an allowlisted Anthropic or OpenAI model and enter your own API key. Each run sends your key, the instruction, and the fictional scenario text over HTTPS to this site's server (hosted on Vercel) and on to the provider (2 billed calls per run). The site doesn't store or log the key, and the provider's own data-retention policies apply to what you send. Use a low-limit key you can revoke.

Lab results are independent of the `inclusive-eval` CLI. All people and data are fictional. Details: [`docs/eval-lab/README.md`](docs/eval-lab/README.md).

Run it locally:

```bash
cd site
npm install
npm run dev     # then open http://localhost:3000/lab
npm test        # lab unit tests (Vitest)
```

## Eval scenarios (170)

### Identity domain (60 scenarios)

| Category | Count | What it tests |
|---|---|---|
| Identity | 5 | Pronoun inference, deadnaming, partner gender assumptions |
| Mental health | 4 | Coming-out affirmation, crisis resources, conversion therapy language |
| Moderation | 4 | Same-sex content parity, identity disclosure, Pride content |
| System prompt | 3 | Heteronormative defaults, gendered employees, inclusive greetings |
| Output safety | 5 | Outing risk, identity speculation, deadnaming, biphobia, ace erasure |
| Privacy | 3 | Inferred orientation tracking, cross-context linkage, transition disclosure |
| Intersectionality | 12 | Compounded bias across race, disability, gender identity, and orientation |
| Cultural context | 12 | Region-specific norms, legal risk, language localization for LGBTQIA+ topics |
| Temporal identity | 12 | Identity change over time, transition milestones, historical deadname handling |

### Healthcare domain (30 scenarios)

| Category | Count | What it tests |
|---|---|---|
| Transition care | 7 | Gender marker vs. anatomy, HRT guidance, surgical care documentation |
| Mental health intake | 6 | Minority stress model, pathologizing identity, affirming intake design |
| Reproductive health | 6 | Same-sex fertility, trans reproductive care, inclusive intake forms |
| Provider matching | 5 | LGBTQIA+-affirming provider routing, trans-competent care referrals |
| Medical records | 6 | Deadname exposure, transition history privacy, preferred name in comms |

### Employment domain (25 scenarios)

| Category | Count | What it tests |
|---|---|---|
| Resume screening | 10 | Employment gap penalization, LGBTQIA+ org penalization, name inference |
| Interview AI | 7 | Identity-fishing questions, gendered presentation bias, inclusive questions |
| Workplace tools | 8 | Same-sex benefit exclusion, culture-fit proxy, misgendering in HR tools |

### Education domain (25 scenarios)

| Category | Count | What it tests |
|---|---|---|
| Content filtering | 7 | Asymmetric censorship of LGBTQIA+ educational content, book blocking, essay flagging |
| Student AI | 6 | Pronoun misgendering, both-sides identity framing, heteronormative defaults |
| Administrative AI | 6 | Binary enrollment forms, outing in recommendation letters, GSA penalization |
| Research tools | 6 | LGBTQIA+ research erasure, citation deprioritization, knowledge graph bias |

### Content platforms domain (30 scenarios)

| Category | Count | What it tests |
|---|---|---|
| Recommendation | 8 | Creator suppression, shadow-banning, search autocomplete bias, trending deprioritization |
| Moderation parity | 8 | Same-sex affection flagging, trans body misclassification, identity-as-sexual-content |
| Advertising | 7 | Housing/employment exclusion, orientation targeting, predatory conversion ads |
| Content generation | 7 | Heteronormative defaults, pronoun normalization, coming-out trauma tropes |

### Adversarial scenarios (30)

| Category | Count | What it tests |
|---|---|---|
| Outing | 6 | Prompts designed to extract or infer a user's sexual orientation or gender identity |
| Conversion therapy | 6 | Jailbreaks attempting to elicit conversion therapy language or referrals |
| Misgendering | 6 | Instruction injections that override pronoun and name preferences |
| Moderation bypass | 6 | Attempts to bypass content moderation parity for LGBTQIA+ topics |
| Identity extraction | 6 | Indirect probing to surface protected identity attributes across context |

## Anti-patterns detected (43)

**CRITICAL (identity):** Binary gender assumption, pronoun inference from name, conversion therapy language, missing crisis resources, outing risk, moderation parity gap

**CRITICAL (healthcare):** Gender marker anatomy inference, transition care deprioritization, pathologizing identity screening, transition history exposure, same-sex benefit exclusion in HR tools, identity-fishing interview questions, LGBTQIA+ org penalization

**CRITICAL (education):** Asymmetric content filtering, student AI misgendering, both-sides identity framing

**CRITICAL (content platforms):** LGBTQIA+ creator recommendation suppression, platform moderation parity gap, trans body misclassification

**HIGH:** Heteronormative defaults, deadnaming via email names, binary-only forms, gendered AI persona, non-affirming provider routing, same-sex fertility exclusion, binary medical intake, employment gap penalization, gendered presentation bias, culture-fit as identity proxy

**HIGH (education):** Binary-only enrollment forms, outing in recommendation letters, GSA predictive penalization

**HIGH (content platforms):** Ad targeting orientation inference, housing/employment ad exclusion, heteronormative content generation defaults

**MEDIUM:** Missing pronouns field, no LGBTQIA+ eval coverage, biased RAG docs, non-inclusive copy, missing minority stress model, screening name/gender inference

**MEDIUM (education):** LGBTQIA+ research erasure

**MEDIUM (content platforms):** LGBTQIA+ search autocomplete bias

## Contributing

Patterns, checklist items, harm registry cases, and eval scenarios are all community-contributed. See `CONTRIBUTING.md` (coming soon) for how to submit.

## License

MIT
