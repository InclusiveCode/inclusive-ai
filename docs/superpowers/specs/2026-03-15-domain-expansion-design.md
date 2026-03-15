# InclusiveCode Domain-Driven Expansion

> Expand InclusiveCode from 24 text-based eval scenarios into a comprehensive, domain-driven LGBT AI safety framework with ~170 scenarios, multimodal/adversarial/pipeline eval capabilities, external tool integrations, and a community-driven harm registry platform.

## Audiences

1. **LLM app developers** (primary) — deeper scenario coverage, more frameworks, domain-specific evals
2. **Platform/infrastructure teams** — training data audits, fine-tuning checks, embedding bias, RLHF pipeline testing
3. **Non-technical stakeholders** — visual dashboard, PDF reports, compliance-friendly output, no CLI required

## Harm Categories

- **Malicious actor abuse** — weaponizing AI against LGBT individuals (harassment, doxxing, deepfakes, targeted misinfo)
- **Subtle systemic bias** — recommendation deprioritization, search ranking, sentiment analysis skew, "neutral" defaults that erase
- **Intersectional compounding** — anti-LGBT bias amplified by race, disability, immigration status, religion, age
- **Domain-specific harms** — healthcare (transition care denial), education (censorship), employment (screening bias), content platforms (moderation parity)

## Positioning

- **Standalone framework** — the comprehensive LGBT AI safety toolkit
- **Interop layer** — adapters for Fairlearn, Guardrails AI, LangChain/LangSmith
- **Community platform** — living, community-driven resource with harm registry, not just a static toolkit

## Contribution Model

- **Curated tier** (PR-reviewed): eval scenarios, tooling, adapter code — high trust bar
- **Open tier** (moderated): harm reports, pattern suggestions, documentation — web-submitted, moderated queue

---

## Architecture

```
inclusive-ai/
├── core/                        # shared eval engine, types, utilities
│   ├── eval-engine/             # scenario runner, verdict logic, reporters
│   ├── adversarial/             # red-team harness, jailbreak templates, social engineering
│   ├── multimodal/              # image/voice/embedding eval adapters
│   └── pipeline/                # RAG, multi-turn, agent workflow testing
│
├── domains/                     # domain-specific eval packages
│   ├── identity/                # current 24 scenarios, refactored (foundation)
│   ├── healthcare/              # transition care, pathologizing, insurance
│   ├── education/               # censorship, history erasure, age-gating
│   ├── employment/              # screening bias, name inference, resume
│   └── content-platforms/       # recommendation, moderation, search ranking
│
├── integrations/                # interop with external fairness tools
│   ├── fairlearn/               # Microsoft Fairlearn adapter
│   ├── guardrails/              # Guardrails AI validators
│   └── langchain/               # LangChain/LangSmith evaluators
│
├── platform/                    # community harm registry (web app)
│   ├── api/                     # harm report submission, moderation queue
│   ├── dashboard/               # non-technical stakeholder view
│   └── site/                    # existing Next.js site, expanded
│
├── plugin/                      # Claude Code plugin (expanded)
├── action/                      # GitHub Action (expanded)
├── hooks/                       # pre-commit hooks (expanded)
└── templates/                   # CLAUDE.md and other drop-ins
```

### Key Architectural Decisions

- `core/eval-engine` is the universal runner. All domain packages depend on it; none depend on each other.
- Domain packages export scenarios in a standard format. The engine is domain-agnostic.
- Adversarial, multimodal, and pipeline capabilities are shared libraries that domains pull in as needed.
- The community platform feeds domain packages but deploys separately.

---

## Core Infrastructure

### Eval Engine (`core/eval-engine`)

The current `runEval()` / `printSummary()` / `assertSafe()` API is preserved. The engine becomes pluggable via adapters:

```typescript
interface EvalAdapter {
  type: "text" | "image" | "embedding" | "multi-turn" | "pipeline";
  run(scenario: EvalScenario, context: EvalContext): Promise<EvalResult>;
}
```

- **Adapters** — each eval type (text, image, embedding, multi-turn) implements `EvalAdapter`. The engine doesn't care what modality it's testing.
- **Verdict aggregation** — same severity model (CRITICAL/HIGH/MEDIUM) with weighted scoring across domains. A healthcare app running identity + healthcare evals gets a single composite verdict.
- **Reporters** — CLI table (current), JSON (for CI), HTML (for dashboard), SARIF (for GitHub code scanning).

### Adversarial Harness (`core/adversarial`)

Red-team testing framework that wraps any domain's scenarios:

- **Jailbreak templates** — systematic prompt injection attempts to bypass LGBT safety guardrails
- **Social engineering** — multi-turn scenarios where the attacker gradually extracts orientation/gender identity through seemingly innocent questions
- **Weaponization detection** — tests whether the model can be used to generate targeted harassment, doxxing templates, or conversion therapy content
- **Bypass scoring** — percentage of safety guardrails circumvented, not just pass/fail

### Multimodal (`core/multimodal`)

- **Image generation** — test for stereotypical depictions, erasure (e.g., "generate a family" never produces same-sex couples), harmful imagery
- **Embeddings** — measure semantic distance bias (are "gay" and "predator" closer than they should be?)
- **TTS/Voice** — test for gendered voice assignment based on names, misgendering through voice synthesis

### Pipeline (`core/pipeline`)

- **RAG auditing** — test what documents get retrieved for LGBT-related queries, check for biased source ranking
- **Agent workflows** — multi-step scenarios where an agent must handle identity correctly across tool calls
- **Multi-turn conversations** — test for identity consistency (does the model "forget" pronouns mid-conversation?)

---

## Domain Packages

Each domain package follows the same structure, exports scenarios in the standard format, and only depends on `core/eval-engine` (plus optionally `core/adversarial`, `core/multimodal`, `core/pipeline`).

### Identity Domain (`domains/identity`) — ~60 scenarios

Refactored from the current 24 scenarios. Expands with:

- **Intersectionality** — compound bias (Black trans woman, disabled nonbinary person, immigrant queer person). Tests whether the model handles overlapping identities or defaults to the "most visible" one.
- **Cultural context** — LGBT safety varies globally. Scenarios for contexts where being out is dangerous, where legal frameworks criminalize identity, where cultural norms differ.
- **Temporal identity** — people whose identity has changed over time. Deadnaming in historical contexts, transition timelines, identity as non-static.

### Healthcare Domain (`domains/healthcare`) — ~30 scenarios

- **Transition care** — AI triage deprioritizing gender-affirming care, insurance pre-auth auto-denial
- **Mental health intake** — screening tools flagging LGBT identity as risk factor, crisis assessment missing minority stress
- **Reproductive health** — anatomy assumptions from gender marker, fertility guidance excluding same-sex couples
- **Provider matching** — recommendations not surfacing affirming providers, outing patients to non-affirming providers
- **Medical records** — surfacing deadnames, exposing transition history, unsafe pre/post-transition record linkage

### Education Domain (`domains/education`) — ~25 scenarios

- **Content filtering** — censoring age-appropriate LGBT content under "safety" rules not applied to heterosexual equivalents
- **Student-facing AI** — tutoring bots that misgender, refuse LGBT topics, or give "both sides" framing on identity
- **Administrative AI** — binary gender enrollment, recommendation letters that out students, predictive models penalizing GSA membership
- **Research tools** — summarization erasing LGBT contributions, citation tools deprioritizing queer scholarship

### Employment Domain (`domains/employment`) — ~25 scenarios

- **Resume screening** — name-based gender inference, penalizing gaps (transition periods), flagging LGBT org membership
- **Interview AI** — identity-fishing questions, sentiment analysis scoring "confident" differently for gender-nonconforming speech
- **Workplace tools** — HR chatbots not recognizing same-sex partner benefits, AI flagging LGBT conversation as "unprofessional"
- **Performance review AI** — "culture fit" scoring penalizing visible queerness

### Content Platforms Domain (`domains/content-platforms`) — ~30 scenarios

- **Recommendation bias** — LGBT creators deprioritized, shadow banning identity-related content
- **Search ranking** — pathologizing/pornographic results before community resources, autocomplete bias
- **Moderation parity** — same-sex affection flagged while heterosexual equivalent passes, trans bodies classified as "sexual"
- **Advertising** — LGBT users excluded from housing/employment/credit ads, hyper-targeted for predatory services
- **Content generation** — writing tools defaulting to heteronormative narratives, image generators unable to produce diverse families

### Total: ~170 scenarios across 5 domains

---

## Integrations Layer

### Fairlearn Adapter (`integrations/fairlearn`)

Wraps InclusiveCode eval results into Fairlearn's `MetricFrame` format. Teams already using Fairlearn add LGBT bias metrics alongside existing fairness dashboards. Bidirectional: can pull Fairlearn disparity metrics into InclusiveCode reports.

### Guardrails AI (`integrations/guardrails`)

InclusiveCode validators that plug into Guardrails' `Guard` pipeline. Real-time: checks every LLM response for anti-patterns before reaching the user, not just in test suites.

### LangChain/LangSmith (`integrations/langchain`)

Custom evaluators for LangSmith tracing. Teams using LangChain agents get LGBT safety scoring on every trace automatically.

---

## Community Platform

### Harm Registry API (`platform/api`)

Web-submitted harm reports with structured fields:
- Product name
- Harm type (from taxonomy)
- Severity
- Evidence (screenshots, transcripts)
- Affected identity/identities

Moderation queue for triage. Reports above a signal threshold get flagged for conversion into eval scenarios.

### Dashboard (`platform/dashboard`)

Non-technical stakeholder view:
- Upload a system prompt or connect an API endpoint
- Get a visual report card across all domains
- No CLI needed
- Exportable PDF for compliance/legal teams

### Expanded Site (`platform/site`)

The existing Next.js site grows to include:
- Harm registry browser (searchable, filterable)
- Domain-specific pattern pages
- Contributor submission flow (web forms for open-tier contributions)

---

## Expanded Tooling

### Claude Code Plugin

- `/lgbt-audit` accepts `--domain` flags for targeted auditing
- Auto-review skill gains domain-aware triggers (detects healthcare code, education code, etc.)
- New `/lgbt-red-team` command runs adversarial scenarios against the current project

### GitHub Action

- Domain selection via inputs
- Composite verdicts across multiple domains
- SARIF output for GitHub code scanning (anti-patterns as inline PR annotations)

### Pre-commit Hook

- Domain-aware pattern expansion
- Healthcare-specific anti-patterns (e.g., `gender === "M"` in medical record schemas)
- Employment-specific patterns (e.g., `inferGender(name)` in screening code)

---

## Anti-Pattern Expansion

Current: 14 anti-patterns across 3 severity levels.

Expanded to ~50+ anti-patterns organized by domain:

**Cross-domain (current 14 + new):**
- All existing patterns preserved
- New: identity-fishing question patterns, intersectional erasure, temporal identity mishandling

**Healthcare-specific:**
- Pathologizing language in triage prompts
- Gender marker → anatomy inference
- Transition history exposure in record queries

**Education-specific:**
- Asymmetric content filtering rules
- Identity-based predictive scoring
- Forced outing in administrative contexts

**Employment-specific:**
- Name-to-gender inference in screening
- Gap penalization in resume scoring
- "Culture fit" proxies for identity

**Content platform-specific:**
- Asymmetric moderation thresholds
- Identity-based recommendation suppression
- Stereotypical generation defaults

---

## Migration Path

The existing project structure maps cleanly:

| Current | Becomes |
|---------|---------|
| `eval/` | `core/eval-engine/` + `domains/identity/` |
| `site/` | `platform/site/` |
| `plugin/` | `plugin/` (expanded) |
| `action/` | `action/` (expanded) |
| `hooks/` | `hooks/` (expanded) |
| `templates/` | `templates/` (expanded) |

The current `@inclusive-ai/eval` package becomes `@inclusive-ai/eval-core` and re-exports the identity domain for backwards compatibility. Existing users see no breaking changes.
