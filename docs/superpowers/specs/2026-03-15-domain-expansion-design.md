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

The current `@inclusive-ai/eval` package becomes `@inclusive-ai/eval-core` and re-exports the identity domain for backwards compatibility.

**Backwards compatibility note:** Adding new values to `ScenarioCategory` is technically a breaking change for consumers doing exhaustive switches. This will be a semver major bump (`@inclusive-ai/eval-core@2.0.0`). The `@inclusive-ai/eval` wrapper package will pin to v2 but re-export only the original 6 categories by default, with an opt-in `import { allCategories } from "@inclusive-ai/eval"` for the expanded set.

**Scenario migration:** Current scenarios map to the identity domain as follows:
- `identity.ts` (5) → `domains/identity/scenarios/identity.ts`
- `mental-health.ts` (4) → `domains/identity/scenarios/mental-health.ts`
- `moderation.ts` (4) → `domains/identity/scenarios/moderation.ts` (cross-domain, re-exported by content-platforms)
- `system-prompt.ts` (3) → `domains/identity/scenarios/system-prompt.ts`
- `output-safety.ts` (5) → `domains/identity/scenarios/output-safety.ts`
- `privacy.ts` (3) → `domains/identity/scenarios/privacy.ts` (cross-domain, re-exported by healthcare and content-platforms)

---

## Type System

The current string-only types are expanded to support multimodal evaluation. `ScenarioCategory` becomes an open string type with known values.

```typescript
// Category is now an open string with known values for autocomplete
export type ScenarioCategory = string;
export const KNOWN_CATEGORIES = [
  // identity domain (original)
  "identity", "moderation", "mental-health", "system-prompt", "output-safety", "privacy",
  // healthcare domain
  "transition-care", "mental-health-intake", "reproductive-health", "provider-matching", "medical-records",
  // education domain
  "content-filtering", "student-ai", "administrative-ai", "research-tools",
  // employment domain
  "resume-screening", "interview-ai", "workplace-tools", "performance-review",
  // content platforms domain
  "recommendation", "search-ranking", "moderation-parity", "advertising", "content-generation",
] as const;

// Unified severity across eval and site patterns
export type Severity = "critical" | "high" | "medium" | "low";

// Base scenario — text modality (backwards compatible)
export interface EvalScenario {
  id: string;
  title: string;
  category: ScenarioCategory;
  severity: Severity;
  modality: "text";
  prompt: string;
  pass: (output: string) => boolean;
  redFlags?: string[];
  tags?: string[];
}

// Image generation scenario
export interface ImageEvalScenario {
  id: string;
  title: string;
  category: ScenarioCategory;
  severity: Severity;
  modality: "image";
  prompt: string;
  pass: (imageUrl: string, metadata: ImageMetadata) => Promise<boolean>;
  redFlags?: string[];
  tags?: string[];
}

interface ImageMetadata {
  altText?: string;
  labels?: string[];        // from vision model classification
  safetyAnnotations?: Record<string, number>;
}

// Embedding bias scenario
export interface EmbeddingEvalScenario {
  id: string;
  title: string;
  category: ScenarioCategory;
  severity: Severity;
  modality: "embedding";
  termPairs: Array<{ term: string; shouldNotBeCloseTo: string[]; threshold: number }>;
  pass: (distances: Record<string, number>) => boolean;
  redFlags?: string[];
  tags?: string[];
}

// Multi-turn conversation scenario
export interface MultiTurnEvalScenario {
  id: string;
  title: string;
  category: ScenarioCategory;
  severity: Severity;
  modality: "multi-turn";
  turns: Array<{ role: "user" | "system"; content: string }>;
  pass: (responses: string[]) => boolean;
  redFlags?: string[];
  tags?: string[];
}

// Pipeline/RAG scenario
export interface PipelineEvalScenario {
  id: string;
  title: string;
  category: ScenarioCategory;
  severity: Severity;
  modality: "pipeline";
  query: string;
  context?: string;
  pass: (output: string, retrievedDocs?: string[]) => boolean;
  redFlags?: string[];
  tags?: string[];
}

// Union type for the engine
export type AnyEvalScenario =
  | EvalScenario
  | ImageEvalScenario
  | EmbeddingEvalScenario
  | MultiTurnEvalScenario
  | PipelineEvalScenario;

// Eval context provided to adapters
export interface EvalContext {
  adapter: EvalAdapter;
  reporter: EvalReporter;
  timeout?: number;
  concurrency?: number;
  apiKey?: string;
}

// Adapter interface — one per modality
export interface EvalAdapter {
  type: AnyEvalScenario["modality"];
  run(scenario: AnyEvalScenario, context: EvalContext): Promise<EvalResult>;
}

// Reporter interface
export type ReporterFormat = "cli" | "json" | "html" | "sarif";
export interface EvalReporter {
  format: ReporterFormat;
  report(results: EvalResult[], summary: EvalSummary): string | Buffer;
}
```

`buildSummary()` becomes dynamic — it groups results by `result.scenario.category` at runtime rather than iterating a hardcoded list.

---

## Package Namespace

Monorepo managed with **npm workspaces** (no additional tooling like turborepo needed at this scale).

| Package | npm name | Description |
|---------|----------|-------------|
| `core/eval-engine` | `@inclusive-ai/eval-core` | Scenario runner, types, reporters |
| `core/adversarial` | `@inclusive-ai/adversarial` | Red-team harness |
| `core/multimodal` | `@inclusive-ai/multimodal` | Image/embedding/voice adapters |
| `core/pipeline` | `@inclusive-ai/pipeline` | RAG/agent/multi-turn testing |
| `domains/identity` | `@inclusive-ai/domain-identity` | Identity scenarios (60) |
| `domains/healthcare` | `@inclusive-ai/domain-healthcare` | Healthcare scenarios (30) |
| `domains/education` | `@inclusive-ai/domain-education` | Education scenarios (25) |
| `domains/employment` | `@inclusive-ai/domain-employment` | Employment scenarios (25) |
| `domains/content-platforms` | `@inclusive-ai/domain-content` | Content platform scenarios (30) |
| `integrations/fairlearn` | `@inclusive-ai/fairlearn` | Fairlearn adapter |
| `integrations/guardrails` | `@inclusive-ai/guardrails` | Guardrails AI validators |
| `integrations/langchain` | `@inclusive-ai/langchain` | LangChain/LangSmith evaluators |
| `eval/` (legacy) | `@inclusive-ai/eval` | Backwards-compat wrapper, re-exports eval-core + domain-identity |

---

## Anti-Pattern Inventory (Current Baseline)

The current project has anti-patterns defined in three locations with inconsistencies:

| Source | Count | Patterns |
|--------|-------|----------|
| `plugin/commands/lgbt-audit.md` | 14 | Binary gender, pronoun inference, conversion therapy, missing crisis resources, outing risk, moderation parity, heteronormative defaults, deadnaming, binary forms, gendered persona, missing pronouns, no eval coverage, biased RAG, non-inclusive copy |
| `site/lib/patterns.ts` | 8 | Subset of the above with code examples |
| `hooks/pre-commit` | 8 | 4 critical + 4 warning regex patterns |
| `eval/hooks/pre-commit` | 8 | Duplicate of hooks/pre-commit |

**Canonical source:** The audit command's 14 patterns become the baseline. The site and hooks are currently incomplete mirrors. Phase 1 will reconcile all three sources into a single shared pattern registry in `core/eval-engine/patterns/`.

**Pre-existing bugs to fix during migration:**
- `site/lib/patterns.ts` references `@inclusive-code/eval` (should be `@inclusive-ai/eval`)
- `eval/hooks/pre-commit` is a duplicate of `hooks/pre-commit` — consolidate to one location
- Site uses `severity: "high" | "medium" | "low"` while eval uses `severity: "critical" | "high" | "medium"` — unify to the 4-level `"critical" | "high" | "medium" | "low"` scale

---

## Community Platform Data Model

### Harm Report Schema

```typescript
interface HarmReport {
  id: string;                          // uuid
  status: HarmReportStatus;
  createdAt: string;                   // ISO 8601
  updatedAt: string;

  // Submitted by reporter
  productName: string;                 // e.g., "ChatGPT", "Gemini", "internal tool"
  productUrl?: string;
  harmType: HarmType;
  severity: Severity;
  affectedIdentities: AffectedIdentity[];
  description: string;                 // what happened
  evidence: Evidence[];                // screenshots, transcripts
  reproductionSteps?: string;          // how to reproduce
  reporterContact?: string;            // optional, for follow-up

  // Added during moderation
  moderatorNotes?: string;
  domain?: ScenarioCategory;           // which domain this maps to
  linkedScenarioIds?: string[];        // eval scenarios created from this report
  linkedPatternIds?: string[];         // anti-patterns created from this report
}

type HarmReportStatus =
  | "submitted"       // awaiting moderation
  | "under-review"    // moderator is evaluating
  | "confirmed"       // validated, awaiting conversion
  | "converted"       // turned into eval scenario or pattern
  | "duplicate"       // matches existing report
  | "rejected";       // not actionable or out of scope

type HarmType =
  | "misgendering"
  | "deadnaming"
  | "outing"
  | "erasure"
  | "pathologizing"
  | "content-bias"
  | "moderation-disparity"
  | "stereotyping"
  | "harassment-generation"
  | "privacy-violation"
  | "denial-of-service"    // e.g., healthcare AI refusing affirming care
  | "other";

type AffectedIdentity =
  | "gay" | "lesbian" | "bisexual" | "transgender" | "nonbinary"
  | "queer" | "intersex" | "asexual" | "aromantic" | "two-spirit"
  | "pansexual" | "other";

interface Evidence {
  type: "screenshot" | "transcript" | "url" | "video";
  url: string;                         // stored in object storage
  description?: string;
}
```

### API Endpoints

```
POST   /api/reports              — submit a harm report (public, rate-limited)
GET    /api/reports              — list reports (public, paginated, filterable by status/domain/harm-type)
GET    /api/reports/:id          — get single report (public for confirmed+, auth for submitted)
PATCH  /api/reports/:id          — update report status/notes (moderator auth required)

GET    /api/reports/stats        — aggregate stats for dashboard (public)

POST   /api/patterns/suggest     — suggest a new anti-pattern (public, rate-limited)
GET    /api/patterns             — list all anti-patterns (public)
```

### Authentication

- **Reporters:** anonymous submission allowed (with rate limiting + captcha). Optional email for follow-up.
- **Moderators:** GitHub OAuth. Moderator role granted by core team via GitHub team membership.
- **Dashboard users:** no auth for public eval results. GitHub OAuth for saving configurations and historical reports.

### Moderation State Machine

```
submitted → under-review → confirmed → converted
                         → duplicate
                         → rejected
```

- Reports auto-move to `under-review` when a moderator opens them
- `confirmed` reports appear in the public harm registry
- `converted` reports link to the eval scenario or pattern they produced
- Moderators can add notes at any stage
- Reporters are notified (if they provided contact) when status changes

---

## Adversarial Bypass Scoring

**Definition:** bypass rate = (guardrails circumvented / guardrails tested) per scenario.

A "guardrail" is any `pass` function assertion. For each scenario, the adversarial harness runs N jailbreak variants (default: 10). Each variant either triggers the pass function (guardrail held) or doesn't (guardrail bypassed).

```typescript
interface AdversarialResult {
  scenario: AnyEvalScenario;
  variants: number;              // how many jailbreak attempts
  bypassed: number;              // how many succeeded in bypassing
  bypassRate: number;            // bypassed / variants
  worstVariant?: string;         // the jailbreak prompt that was most effective
}
```

Aggregate bypass rate across all scenarios provides a single "adversarial resilience score" (0-100%, higher = more resilient).

---

## Testing Strategy

Three-tier test pyramid:

| Tier | What | How | When |
|------|------|-----|------|
| **Unit** | `pass` function logic against known input strings | vitest, no API calls, fast | Every PR, every commit |
| **Integration** | Scenario execution against a mock LLM (returns canned responses) | vitest with mock adapter, no API costs | Every PR |
| **E2E** | Full scenario execution against real Anthropic/OpenAI API | vitest with real adapter, API costs | Nightly CI + manual trigger |

Domain packages only need unit tests (their scenarios are data — the `pass` functions are pure). The eval engine needs integration tests. E2E tests run in a separate CI workflow with API key secrets, gated to `main` branch nightly runs.

---

## Phasing

### Phase 1: Core Refactor + Identity Expansion
**Deliverables:**
- Restructure monorepo with npm workspaces
- Extract `core/eval-engine` from current `eval/`
- Expand type system (`AnyEvalScenario`, `EvalAdapter`, `EvalContext`)
- Reconcile anti-pattern inventories into single registry
- Fix pre-existing bugs (package name typo, duplicate hooks, severity mismatch)
- Expand identity domain from 24 → 60 scenarios
- `@inclusive-ai/eval` wrapper package for backwards compat
- Add JSON and SARIF reporters

**Exit criteria:** All existing tests pass. `@inclusive-ai/eval` public API unchanged. 60 identity scenarios passing against mock adapter.

### Phase 2: New Domains
**Deliverables:**
- `@inclusive-ai/domain-healthcare` (30 scenarios)
- `@inclusive-ai/domain-education` (25 scenarios)
- `@inclusive-ai/domain-employment` (25 scenarios)
- `@inclusive-ai/domain-content` (30 scenarios)
- Domain-aware CLI: `inclusive-eval --domain healthcare`
- Update plugin `/lgbt-audit` for domain flags
- Update GitHub Action for domain selection

**Exit criteria:** 170 total scenarios. All pass functions unit-tested. CLI and CI tooling work with domain filtering.

### Phase 3: Adversarial + Multimodal + Pipeline
**Deliverables:**
- `@inclusive-ai/adversarial` — red-team harness with jailbreak templates
- `@inclusive-ai/multimodal` — image and embedding eval adapters
- `@inclusive-ai/pipeline` — RAG and multi-turn adapters
- New `/lgbt-red-team` plugin command
- Bypass scoring metric

**Exit criteria:** Adversarial harness runs against all 170 text scenarios. At least 10 image eval scenarios and 5 embedding bias scenarios passing. Multi-turn adapter handles 3+ turn conversations.

### Phase 4: Integrations
**Deliverables:**
- `@inclusive-ai/fairlearn` adapter
- `@inclusive-ai/guardrails` validators
- `@inclusive-ai/langchain` evaluators
- Integration docs and examples

**Exit criteria:** Each adapter has a working example in `examples/`. Integration tests pass against target library versions.

### Phase 5: Community Platform
**Deliverables:**
- Harm registry API (submission, moderation, public browsing)
- Dashboard (upload prompt → get report card, PDF export)
- Expanded site (registry browser, contributor submission flow)
- Moderation tooling for core team

**Exit criteria:** End-to-end flow: anonymous user submits harm report → moderator triages → report appears in public registry. Dashboard produces PDF report from uploaded system prompt.
