# InclusiveCode

> LGBT safety resources, patterns, and eval tools for LLM engineers.

**Live site:** [inclusive-ai.vercel.app](https://inclusive-ai.vercel.app)

## What's here

| Path | What it is |
|---|---|
| `/site` | Next.js website — pattern library, checklist, harm registry |
| `/core/eval-engine` | `@inclusive-ai/eval-core` — core eval engine and runner |
| `/domains/identity` | `@inclusive-ai/domain-identity` — identity domain scenarios and logic |
| `/domains/healthcare` | `@inclusive-ai/domain-healthcare` — healthcare domain scenarios |
| `/domains/employment` | `@inclusive-ai/domain-employment` — employment domain scenarios |
| `/domains/education` | `@inclusive-ai/domain-education` — education domain scenarios |
| `/domains/content` | `@inclusive-ai/domain-content` — content platforms domain scenarios |
| `/packages/eval` | `@inclusive-ai/eval` — user-facing wrapper, 170 runnable safety scenarios |
| `/packages/adversarial` | `@inclusive-ai/adversarial` — 15 attack templates, 30 adversarial scenarios, bypass scoring |
| `/plugin` | Claude Code plugin — `/lgbt-audit` command + auto-review skill |
| `/action` | GitHub Action — run LGBT safety evals in CI |
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
ANTHROPIC_API_KEY=sk-... npx inclusive-eval
inclusive-eval --category identity,moderation
inclusive-eval --domain healthcare
inclusive-eval --domain employment
inclusive-eval --domain education
inclusive-eval --domain content
inclusive-eval --severity critical

# Red-team your system prompt with 15 attack templates
ANTHROPIC_API_KEY=sk-... npx inclusive-eval --red-team

# Run 30 adversarial jailbreak scenarios
ANTHROPIC_API_KEY=sk-... npx inclusive-eval --adversarial
```

### 2. Install the Claude Code plugin

```bash
# From marketplace (when available)
/plugin install inclusive-ai@claude-code-marketplace

# Or copy the command manually
cp plugin/commands/lgbt-audit.md .claude/commands/
```

Then run `/lgbt-audit` in any project to get a full scored audit.

### 3. Add to CI with GitHub Actions

```yaml
# .github/workflows/safety.yml
name: LGBT Safety
on: [push, pull_request]
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: InclusiveCode/inclusive-ai/action@main
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          system-prompt: "Your system prompt here"
```

### 4. Add the pre-commit hook

```bash
cp hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Or with husky:

```bash
npx husky add .husky/pre-commit "bash hooks/pre-commit"
```

### 5. Add always-on Claude context

Drop the template into your project:

```bash
cp templates/CLAUDE.md .claude/CLAUDE.md
```

Claude will automatically apply LGBT safety rules when writing or reviewing code.

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
| Cultural context | 12 | Region-specific norms, legal risk, language localization for LGBT topics |
| Temporal identity | 12 | Identity change over time, transition milestones, historical deadname handling |

### Healthcare domain (30 scenarios)

| Category | Count | What it tests |
|---|---|---|
| Transition care | 7 | Gender marker vs. anatomy, HRT guidance, surgical care documentation |
| Mental health intake | 6 | Minority stress model, pathologizing identity, affirming intake design |
| Reproductive health | 6 | Same-sex fertility, trans reproductive care, inclusive intake forms |
| Provider matching | 5 | LGBT-affirming provider routing, trans-competent care referrals |
| Medical records | 6 | Deadname exposure, transition history privacy, preferred name in comms |

### Employment domain (25 scenarios)

| Category | Count | What it tests |
|---|---|---|
| Resume screening | 10 | Employment gap penalization, LGBT org penalization, name inference |
| Interview AI | 7 | Identity-fishing questions, gendered presentation bias, inclusive questions |
| Workplace tools | 8 | Same-sex benefit exclusion, culture-fit proxy, misgendering in HR tools |

### Education domain (25 scenarios)

| Category | Count | What it tests |
|---|---|---|
| Content filtering | 7 | Asymmetric censorship of LGBT educational content, book blocking, essay flagging |
| Student AI | 6 | Pronoun misgendering, both-sides identity framing, heteronormative defaults |
| Administrative AI | 6 | Binary enrollment forms, outing in recommendation letters, GSA penalization |
| Research tools | 6 | LGBT research erasure, citation deprioritization, knowledge graph bias |

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
| Moderation bypass | 6 | Attempts to bypass content moderation parity for LGBT topics |
| Identity extraction | 6 | Indirect probing to surface protected identity attributes across context |

## Anti-patterns detected (43)

**CRITICAL (identity):** Binary gender assumption, pronoun inference from name, conversion therapy language, missing crisis resources, outing risk, moderation parity gap

**CRITICAL (healthcare):** Gender marker anatomy inference, transition care deprioritization, pathologizing identity screening, transition history exposure, same-sex benefit exclusion in HR tools, identity-fishing interview questions, LGBT org penalization

**CRITICAL (education):** Asymmetric content filtering, student AI misgendering, both-sides identity framing

**CRITICAL (content platforms):** LGBT creator recommendation suppression, platform moderation parity gap, trans body misclassification

**HIGH:** Heteronormative defaults, deadnaming via email names, binary-only forms, gendered AI persona, non-affirming provider routing, same-sex fertility exclusion, binary medical intake, employment gap penalization, gendered presentation bias, culture-fit as identity proxy

**HIGH (education):** Binary-only enrollment forms, outing in recommendation letters, GSA predictive penalization

**HIGH (content platforms):** Ad targeting orientation inference, housing/employment ad exclusion, heteronormative content generation defaults

**MEDIUM:** Missing pronouns field, no LGBT eval coverage, biased RAG docs, non-inclusive copy, missing minority stress model, screening name/gender inference

**MEDIUM (education):** LGBT research erasure

**MEDIUM (content platforms):** LGBT search autocomplete bias

## Contributing

Patterns, checklist items, harm registry cases, and eval scenarios are all community-contributed. See `CONTRIBUTING.md` (coming soon) for how to submit.

## License

MIT
